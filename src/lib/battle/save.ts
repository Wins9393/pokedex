import { prochainEcran } from './engine'
import type { BattleState, Choix, Ecran, Passage } from './types'

const CLE = 'pokedex:combat'

/**
 * Version de la forme sauvegardée.
 *
 * À incrémenter dès que `Battler`, `BattleState` ou `Ecran` changent de
 * forme. Une sauvegarde d'hier suffit à casser le code d'aujourd'hui — on
 * vient de le payer avec le vivier d'attaques, dont les entrées en cache
 * n'avaient pas d'archétype et faisaient tomber l'arène.
 */
export const VERSION = 1

/**
 * Le combat en cours, tel qu'il est écrit sur le disque.
 *
 * Cinq champs, là où la page en tient onze : tout le reste — l'état
 * affiché, le récit du tour, l'étape courante, le message, l'impact —
 * n'est que la mise en scène d'un rejeu, et se recalcule.
 *
 * Deux absences sont délibérées :
 *
 * - **Aucun nom de joueur.** Ils vivent sous leur propre clé et survivent à
 *   « Rejouer » ; les recopier ici figerait l'ancien pseudo dans une partie
 *   reprise après un changement de nom.
 * - **Aucune action en attente.** `enAttente` est le choix du joueur 1
 *   pendant que le joueur 2 décide : l'écrire en clair sur le disque
 *   trahirait exactement ce que l'écran de passage sert à cacher. La reprise
 *   rembobine ce tour-là — voir `reprendre`.
 */
export type CombatSauve = {
  version: number
  /**
   * L'équipe du joueur 1, et le déclencheur de toute sauvegarde : avant
   * elle il n'y a rien à retenir. La composition *en cours* du joueur 1 vit
   * dans `TeamPicker` et n'est pas récupérable d'ici — ce qui se sauve
   * commence donc à sa validation.
   */
  equipe1: Choix[]
  /** `null` pendant que le joueur 2 compose la sienne. */
  equipe2: Choix[] | null
  /** `null` tant que les capacités ne sont pas revenues et le combat monté. */
  etat: BattleState | null
  ecran: Ecran
  passage: Passage | null
}

export function ecrire(sauve: Omit<CombatSauve, 'version'>) {
  try {
    localStorage.setItem(CLE, JSON.stringify({ version: VERSION, ...sauve }))
  } catch {
    // Stockage plein ou refusé : le combat continue, il ne survivra pas.
  }
}

export function effacer() {
  try {
    localStorage.removeItem(CLE)
  } catch {
    // ignore
  }
}

/**
 * Relit la sauvegarde, et rend `null` à la moindre surprise plutôt que de
 * laisser une donnée douteuse atteindre le moteur. Le contrôle est
 * volontairement grossier : il ne prouve pas que l'état est cohérent, il
 * garantit qu'il a la bonne allure et la bonne version.
 */
export function lire(): CombatSauve | null {
  try {
    const brut = localStorage.getItem(CLE)
    if (!brut) return null

    const valeur = JSON.parse(brut) as Partial<CombatSauve>
    if (valeur.version !== VERSION) return null
    if (!valeur.ecran || !valeur.equipe1?.length) return null

    if (valeur.etat) {
      if (valeur.etat.teams?.length !== 2) return null
      if (valeur.etat.teams.some((equipe) => !equipe?.battlers?.length)) return null
    }

    return valeur as CombatSauve
  } catch {
    return null
  }
}

/**
 * Par où rentrer dans une partie reprise.
 *
 * Deux situations ne se restaurent pas telles quelles :
 *
 * - **Un rejeu en cours.** Le récit n'est pas sauvegardé, mais `etat` est
 *   déjà celui d'*après* le tour : rien n'est perdu du combat, seulement sa
 *   narration. On rentre par la porte normale, celle qui suit un tour.
 * - **Le choix du joueur 2.** Le choix du joueur 1 n'a pas été sauvegardé.
 *   Reprendre là laisserait `enAttente` à `null`, et
 *   `[enAttente ?? { kind: 'move', slot: 0 }]` ferait attaquer le joueur 1
 *   avec sa première attaque sans qu'il l'ait choisie. On rembobine donc le
 *   tour au choix du joueur 1 : un choix à refaire vaut mieux qu'un coup
 *   qu'on n'a pas donné.
 */
export function reprendre(sauve: CombatSauve): { ecran: Ecran; passage: Passage | null } {
  const { etat, ecran, passage } = sauve

  if (etat && ecran.kind === 'replay') {
    const suite = prochainEcran(etat)
    return { ecran: suite.passage ? suite.passage.ecran : suite.ecran, passage: suite.passage }
  }

  const viseLeSecond =
    (ecran.kind === 'choix' && ecran.side === 1) ||
    (passage?.ecran.kind === 'choix' && passage.ecran.side === 1)

  if (viseLeSecond) {
    const depart: Ecran = { kind: 'choix', side: 0 }
    return { ecran: depart, passage: { vers: 1, ecran: depart, detail: 'Reprise du tour' } }
  }

  return { ecran, passage }
}
