import type { BattleForm, PokemonSummary } from '@/api/models'
import { STAT_ORDER } from '@/lib/pokemon-types'
import type { StatName, TypeName } from '@/lib/pokemon-types'

/**
 * Au-delà, la forme n'est plus un choix mais une garantie. Le seuil ne vise
 * qu'Eternatus Éternamax et son total de 1125 : la forme suivante est
 * Méga-Mewtwo à 780, dans l'épure d'Arceus (720) déjà présent au dex.
 */
const TOTAL_MAX = 800

/**
 * Ce qui distingue vraiment une forme au combat. Deux formes de même
 * empreinte se jouent exactement pareil, quel que soit leur nom.
 */
const empreinte = (types: readonly TypeName[], stats: Record<StatName, number>) =>
  `${types.join('/')}|${STAT_ORDER.map((clef) => stats[clef]).join(',')}`

/**
 * Trie les 326 formes de l'API pour ne garder que celles qui changent
 * quelque chose au combat — 219 sur 179 espèces.
 *
 * Les trois règles se lisent dans les données, jamais dans une liste de
 * noms à tenir à jour :
 *
 * - **même empreinte que l'espèce** → 92 formes, dont les 33 Gigamax, les
 *   10 Alpha et les Pikachu déguisés. Elles n'existent que pour l'allure,
 *   et le mode combat propose déjà le chromatique pour ça.
 * - **empreinte déjà vue chez la même espèce** → les 7 noyaux de Minior,
 *   identiques entre eux, se réduisent à une seule entrée.
 * - **total hors barème** → voir `TOTAL_MAX`.
 *
 * Le résultat est indexé par espèce : c'est ainsi que la sélection le lit,
 * un Pokémon à la fois.
 */
export function formesJouables(
  formes: readonly BattleForm[],
  parId: ReadonlyMap<number, PokemonSummary>,
): Map<number, BattleForm[]> {
  const parEspece = new Map<number, BattleForm[]>()
  const vues = new Map<number, Set<string>>()

  for (const forme of formes) {
    const espece = parId.get(forme.speciesId)
    if (!espece || forme.statTotal > TOTAL_MAX) continue

    const signature = empreinte(forme.types, forme.stats)
    if (signature === empreinte(espece.types, espece.stats)) continue

    const deja = vues.get(forme.speciesId) ?? new Set<string>()
    if (deja.has(signature)) continue
    deja.add(signature)
    vues.set(forme.speciesId, deja)

    parEspece.set(forme.speciesId, [...(parEspece.get(forme.speciesId) ?? []), forme])
  }

  return parEspece
}

/** À plat, pour le téléchargement hors ligne qui raisonne en identifiants. */
export const idsDesFormes = (parEspece: ReadonlyMap<number, BattleForm[]>) =>
  [...parEspece.values()].flat().map((forme) => forme.id)
