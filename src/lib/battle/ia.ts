import type { PokemonSummary } from '@/api/models'
import type { TypeChart } from '@/lib/type-chart'
import { degatsDeFrappe, efficaciteContre, efficaciteDuType } from './damage'
import { actif, remplacantsDisponibles } from './engine'
import { createRng, randInt } from './rng'
import type { Action, BattleState, Battler, Choix, Side } from './types'
import { TAILLE_EQUIPE } from './types'

/**
 * L'adversaire du mode solo.
 *
 * Il ne triche pas : il ne lit que ce que le joueur voit lui aussi — les
 * types affichés en face, les points de vie, ses propres attaques. Il ne
 * connaît pas les attaques adverses, et n'anticipe pas le tour suivant.
 * C'est volontaire : une IA qui verrait le jeu de l'autre gagnerait sans
 * que ce soit intéressant, et une IA qui déroulerait un arbre de recherche
 * serait un projet à elle seule pour un gain invisible sur trois Pokémon.
 */

/**
 * Variation médiane de la formule de dégâts, qui tire entre 85 et 100.
 *
 * L'IA estime avec 92 là où le combat tirera au hasard : elle se trompe
 * donc toujours un peu, dans les deux sens, ce qui est exactement la
 * situation du joueur en face.
 */
const VARIATION_MEDIANE = 92

/**
 * Une décision sur cinq est le deuxième meilleur coup plutôt que le
 * meilleur.
 *
 * Un adversaire qui joue toujours l'optimum devient prévisible : on calcule
 * sa réponse, et le combat devient un exercice. Une erreur sur cinq suffit
 * à rendre l'échange incertain sans le rendre injuste — et jamais quand le
 * meilleur coup met K.O., parce que rater ça ne serait pas de
 * l'imperfection, ce serait de la bêtise.
 */
const PART_IMPARFAITE = 0.2

/** Décalage de graine, pour que l'IA ne consomme pas l'aléatoire du combat. */
const GRAINE_IA = 0x9e3779b9

/**
 * Dégâts qu'une attaque **devrait** faire, sans la jouer : pas de coup
 * critique, variation médiane, et la précision appliquée comme une
 * espérance. C'est la formule du combat — la vraie, celle de `damage.ts` —
 * à laquelle on fournit un hasard moyen plutôt qu'un tirage.
 */
export function degatsAttendus(
  attaquant: Battler,
  defenseur: Battler,
  slot: Battler['moves'][number],
  chart: TypeChart,
): number {
  if (slot.pp <= 0) return 0

  const efficacite = efficaciteContre(chart, slot.move, defenseur.types)
  if (efficacite === 0) return 0

  const degats = degatsDeFrappe(attaquant, defenseur, slot.move, efficacite, {
    critique: false,
    variation: VARIATION_MEDIANE,
  })

  return (degats * (slot.move.accuracy ?? 100)) / 100
}

/** La meilleure attaque disponible, et ce qu'elle devrait retirer. */
function meilleureAttaque(attaquant: Battler, defenseur: Battler, chart: TypeChart) {
  let slot = -1
  let degats = -1

  attaquant.moves.forEach((emplacement, index) => {
    const attendus = degatsAttendus(attaquant, defenseur, emplacement, chart)
    if (attendus > degats) {
      degats = attendus
      slot = index
    }
  })

  return { slot, degats: Math.max(0, degats) }
}

/**
 * Ce que l'adversaire d'en face peut faire de pire, jugé sur ses seuls
 * types. C'est l'information dont dispose le joueur quand il décide de
 * changer de Pokémon : on ne connaît pas les attaques adverses, on lit les
 * deux pastilles sous son nom et on suppose qu'il tape avec.
 */
function menaceDeType(menacant: Battler, cible: Battler, chart: TypeChart): number {
  return menacant.types.reduce(
    (pire, type) => Math.max(pire, efficaciteDuType(chart, type, cible.types)),
    0.25,
  )
}

/**
 * La note d'un combattant face à celui d'en face : ce qu'il lui enlève,
 * pondéré par ce qu'il encaisse. Un score de 1 signifie « je le mets K.O.
 * ce tour-ci et il ne me fait rien de spécial ».
 *
 * Exportée parce que c'est la mesure que `verify:battle` interroge : une
 * décision de l'IA se juge à ce qu'elle vaut, pas au numéro d'emplacement
 * qu'elle renvoie.
 */
export function note(candidat: Battler, adverse: Battler, chart: TypeChart): number {
  const { degats } = meilleureAttaque(candidat, adverse, chart)
  const offensif = Math.min(1, degats / Math.max(1, adverse.hp))
  return offensif / menaceDeType(adverse, candidat, chart)
}

/**
 * Seuils du changement volontaire. Il coûte le tour : il faut donc que le
 * remplaçant soit *nettement* meilleur, pas seulement meilleur — sinon
 * l'IA passerait son temps à faire entrer et sortir ses Pokémon en offrant
 * une attaque gratuite à chaque fois.
 */
const NOTE_INSUFFISANTE = 0.5
const GAIN_MINIMUM = 2.5

/**
 * Le coup que joue l'adversaire.
 *
 * Déterministe à état égal : la graine vient du combat lui-même. Une partie
 * sauvegardée puis reprise redonne donc la même décision, et
 * `verify:battle` peut la vérifier.
 */
export function choisirActionIA(etat: BattleState, side: Side, chart: TypeChart): Action {
  const moi = actif(etat, side)
  const lui = actif(etat, (1 - side) as Side)
  const rng = createRng((etat.seed ^ GRAINE_IA) >>> 0)

  const { slot, degats } = meilleureAttaque(moi, lui, chart)
  const acheve = degats >= lui.hp

  // Un K.O. à portée ne se discute pas : ni changement, ni approximation.
  if (acheve && slot >= 0) return { kind: 'move', slot }

  const banc = remplacantsDisponibles(etat, side)
  if (banc.length > 0) {
    const actuelle = note(moi, lui, chart)
    if (actuelle < NOTE_INSUFFISANTE) {
      const meilleur = banc.reduce((meilleur, candidat) =>
        note(candidat.battler, lui, chart) > note(meilleur.battler, lui, chart)
          ? candidat
          : meilleur,
      )
      if (note(meilleur.battler, lui, chart) >= Math.max(actuelle, 0.01) * GAIN_MINIMUM) {
        return { kind: 'switch', to: meilleur.index }
      }
    }
  }

  if (slot < 0) return { kind: 'move', slot: 0 }

  if (rng() < PART_IMPARFAITE) {
    const second = moi.moves
      .map((emplacement, index) => ({ index, degats: degatsAttendus(moi, lui, emplacement, chart) }))
      .filter((candidat) => candidat.index !== slot && candidat.degats > 0)
      .sort((a, b) => b.degats - a.degats)[0]

    if (second) return { kind: 'move', slot: second.index }
  }

  return { kind: 'move', slot }
}

/** Le remplaçant envoyé après un K.O. : le mieux placé face à ce qui reste. */
export function choisirRemplacantIA(etat: BattleState, side: Side, chart: TypeChart): number {
  const lui = actif(etat, (1 - side) as Side)
  const banc = remplacantsDisponibles(etat, side)
  if (banc.length === 0) return etat.teams[side].active

  return banc.reduce((meilleur, candidat) =>
    note(candidat.battler, lui, chart) > note(meilleur.battler, lui, chart) ? candidat : meilleur,
  ).index
}

/* ------------------------------------------------------------------ *
 * L'équipe de l'adversaire
 * ------------------------------------------------------------------ */

/**
 * Écart de statistiques toléré autour de chaque Pokémon du joueur, élargi
 * tant que le vivier est trop maigre pour que le tirage ait un sens.
 */
const ECART_DEPART = 25
const ECART_PAS = 25
const VIVIER_MINIMUM = 12

/**
 * L'IA compose son équipe **en miroir de celle du joueur** : à chaque
 * Pokémon choisi, elle en oppose un de force comparable.
 *
 * C'est ce qui remplace un niveau de difficulté. Trois Pokémon de départ
 * donnent un combat de Pokémon de départ ; trois légendaires donnent trois
 * légendaires en face. Le joueur règle lui-même l'exigence de la partie, et
 * il n'y a aucune liste d'équipes à maintenir — seulement le total des
 * statistiques de base, qui vient des données.
 */
export function composerEquipeIA(
  pokemon: readonly PokemonSummary[],
  equipeJoueur: readonly Choix[],
  graine: number,
): Choix[] {
  const parId = new Map(pokemon.map((p) => [p.id, p]))
  const rng = createRng(graine >>> 0)

  // Les bébés Pokémon sont hors sujet : personne ne les aligne, et leur
  // total de statistiques les ferait quand même sortir du vivier.
  const vivier = pokemon.filter((p) => !p.isBaby)

  const interdits = new Set(equipeJoueur.map((choix) => choix.speciesId))
  const typesPris = new Set<string>()
  const equipe: Choix[] = []

  for (const choix of equipeJoueur.slice(0, TAILLE_EQUIPE)) {
    const cible = parId.get(choix.speciesId)?.statTotal ?? 500

    let candidats: PokemonSummary[] = []
    for (let ecart = ECART_DEPART; candidats.length < VIVIER_MINIMUM; ecart += ECART_PAS) {
      candidats = vivier.filter(
        (p) => !interdits.has(p.id) && Math.abs(p.statTotal - cible) <= ecart,
      )
      // Garde-fou : au-delà, l'écart couvre le dex entier et boucler
      // n'apporterait plus rien.
      if (ecart > 600) break
    }

    if (candidats.length === 0) candidats = vivier.filter((p) => !interdits.has(p.id))
    if (candidats.length === 0) break

    /*
     * Un type principal encore libre, quand le vivier le permet : trois
     * Pokémon Eau en face, c'est un combat qui se gagne avec une seule
     * attaque. On ne l'impose pas — ce serait parfois vider le vivier.
     */
    const varies = candidats.filter((p) => !typesPris.has(p.types[0]))
    const retenus = varies.length >= 4 ? varies : candidats

    const elu = retenus[randInt(rng, retenus.length)]
    interdits.add(elu.id)
    typesPris.add(elu.types[0])
    equipe.push({ speciesId: elu.id, formId: null, shiny: false })
  }

  return equipe
}
