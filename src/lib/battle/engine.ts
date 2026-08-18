import type { BattleForm, Move, PokemonSummary } from '@/api/models'
import type { TypeChart } from '@/lib/type-chart'
import { resoudreFrappe } from './damage'
import { choisirAttaques, LUTTE } from './moveset'
import { createRng } from './rng'
import type { Rng } from './rng'
import { statsDeCombat } from './stats'
import type {
  Action,
  BattleEvent,
  BattleState,
  Battler,
  Ecran,
  Passage,
  Side,
  Team,
} from './types'

/* ------------------------------------------------------------------ *
 * Construction
 * ------------------------------------------------------------------ */

/**
 * Monte un combattant. La forme, quand il y en a une, ne fait que se
 * substituer à l'espèce comme source de types, de statistiques et de
 * sprites : rien d'autre dans le moteur ne sait qu'elle existe.
 *
 * Les capacités, elles, sont fournies par l'appelant — voir `apprises` dans
 * `BattlePage`, qui réunit le vivier de l'espèce et celui de la forme.
 */
export function creerBattler(
  summary: PokemonSummary,
  forme: BattleForm | null,
  shiny: boolean,
  apprises: readonly number[],
  parId: ReadonlyMap<number, Move>,
): Battler {
  const types = forme?.types ?? summary.types
  const base = forme?.stats ?? summary.stats
  const stats = statsDeCombat(base)

  return {
    dexId: summary.id,
    spriteId: forme?.id ?? summary.id,
    shiny,
    name: forme?.name ?? summary.name,
    types,
    stats,
    hp: stats.hp,
    maxHp: stats.hp,
    moves: choisirAttaques(types, base, apprises, parId),
  }
}

export function creerCombat(equipes: [Battler[], Battler[]], seed: number): BattleState {
  return {
    teams: [
      { battlers: equipes[0], active: 0 },
      { battlers: equipes[1], active: 0 },
    ],
    turn: 1,
    winner: null,
    seed,
  }
}

/* ------------------------------------------------------------------ *
 * Lecture de l'état
 * ------------------------------------------------------------------ */

export const actif = (etat: BattleState, side: Side) =>
  etat.teams[side].battlers[etat.teams[side].active]

export const equipeVaincue = (equipe: Team) => equipe.battlers.every((b) => b.hp <= 0)

/** Vrai quand le Pokémon sur le terrain est K.O. mais qu'il reste des remplaçants. */
export const doitRemplacer = (etat: BattleState, side: Side) =>
  etat.winner === null && actif(etat, side).hp <= 0 && !equipeVaincue(etat.teams[side])

/**
 * Ce qui doit s'afficher une fois un tour déroulé : fin de partie, choix
 * d'un remplaçant, ou tour suivant.
 *
 * Dans le moteur parce que deux appelants en ont besoin et doivent répondre
 * pareil — l'enchaînement après un tour, et la reprise d'une partie
 * sauvegardée. Une seconde implémentation dériverait, et une partie reprise
 * ne s'ouvrirait pas là où elle s'était arrêtée.
 */
export function prochainEcran(etat: BattleState): { ecran: Ecran; passage: Passage | null } {
  if (etat.winner !== null) return { ecran: { kind: 'fin' }, passage: null }

  for (const side of [0, 1] as Side[]) {
    if (doitRemplacer(etat, side)) {
      const ecran: Ecran = { kind: 'remplacement', side }
      return {
        ecran,
        passage: { vers: (side + 1) as 1 | 2, ecran, detail: 'Choisis ton prochain Pokémon' },
      }
    }
  }

  const ecran: Ecran = { kind: 'choix', side: 0 }
  return { ecran, passage: { vers: 1, ecran } }
}

export const remplacantsDisponibles = (etat: BattleState, side: Side) =>
  etat.teams[side].battlers
    .map((battler, index) => ({ battler, index }))
    .filter(({ battler, index }) => battler.hp > 0 && index !== etat.teams[side].active)

/*
 * Les objets `Move` sont immuables et partagés : les recopier à chaque tour
 * multiplierait la mémoire sans rien apporter. Seuls l'état des combattants
 * et leurs PP ont besoin d'être dupliqués.
 */
const clonerBattler = (b: Battler): Battler => ({ ...b, moves: b.moves.map((s) => ({ ...s })) })
const clonerEquipe = (t: Team): Team => ({ ...t, battlers: t.battlers.map(clonerBattler) })

const cloner = (etat: BattleState): BattleState => ({
  ...etat,
  teams: [clonerEquipe(etat.teams[0]), clonerEquipe(etat.teams[1])],
})

/* ------------------------------------------------------------------ *
 * Résolution d'un tour
 * ------------------------------------------------------------------ */

const prioriteDe = (etat: BattleState, side: Side, action: Action) =>
  action.kind === 'move' ? (actif(etat, side).moves[action.slot]?.move.priority ?? 0) : 0

/**
 * Priorité d'abord, Vitesse ensuite, tirage au sort en cas d'égalité
 * parfaite. Le tirage est fait **avant** le tri plutôt que dans le
 * comparateur : `sort` appelle celui-ci un nombre de fois non spécifié, ce
 * qui consommerait l'aléatoire de façon imprévisible et casserait la
 * reproductibilité à graine égale.
 */
function ordreDAttaque(etat: BattleState, actions: [Action, Action], rng: Rng): Side[] {
  const cotes = ([0, 1] as Side[]).filter((side) => actions[side].kind === 'move')
  if (cotes.length < 2) return cotes

  const [a, b] = cotes as [Side, Side]

  const prioA = prioriteDe(etat, a, actions[a])
  const prioB = prioriteDe(etat, b, actions[b])
  if (prioA !== prioB) return prioA > prioB ? [a, b] : [b, a]

  const vitesseA = actif(etat, a).stats.speed
  const vitesseB = actif(etat, b).stats.speed
  if (vitesseA !== vitesseB) return vitesseA > vitesseB ? [a, b] : [b, a]

  return rng() < 0.5 ? [a, b] : [b, a]
}

export function resoudreTour(
  etat: BattleState,
  actions: [Action, Action],
  chart: TypeChart,
): { etat: BattleState; events: BattleEvent[] } {
  if (etat.winner !== null) return { etat, events: [] }

  const suivant = cloner(etat)
  const events: BattleEvent[] = []
  const rng = createRng(suivant.seed)

  // Les changements précèdent toutes les attaques, quelle que soit la
  // Vitesse : c'est ce qui fait qu'un changement « coûte » le tour.
  for (const side of [0, 1] as Side[]) {
    const action = actions[side]
    if (action.kind !== 'switch') continue

    const equipe = suivant.teams[side]
    const entrant = equipe.battlers[action.to]
    if (!entrant || entrant.hp <= 0 || action.to === equipe.active) continue

    const sortant = equipe.battlers[equipe.active]
    equipe.active = action.to
    events.push({
      kind: 'switch',
      side,
      from: sortant.name,
      to: entrant.name,
      toIndex: action.to,
    })
  }

  for (const side of ordreDAttaque(suivant, actions, rng)) {
    if (suivant.winner !== null) break

    const action = actions[side]
    if (action.kind !== 'move') continue

    const attaquant = actif(suivant, side)
    // Mis K.O. par l'adversaire plus tôt dans le tour : il ne frappe pas.
    if (attaquant.hp <= 0) continue

    const cible = (1 - side) as Side
    const defenseur = actif(suivant, cible)
    if (defenseur.hp <= 0) continue

    const emplacement = attaquant.moves[action.slot]
    const move = emplacement && emplacement.pp > 0 ? emplacement.move : LUTTE
    if (emplacement && emplacement.pp > 0) emplacement.pp -= 1

    events.push({
      kind: 'move',
      side,
      user: attaquant.name,
      move: move.name,
      type: move.type,
      archetype: move.archetype,
    })

    const frappe = resoudreFrappe(attaquant, defenseur, move, chart, rng)

    if (frappe.efficacite === 0) {
      events.push({ kind: 'immune', side, target: defenseur.name })
      continue
    }
    if (!frappe.touche) {
      events.push({ kind: 'miss', side, user: attaquant.name })
      continue
    }

    /*
     * Les dégâts avant leur commentaire, comme dans les jeux : on voit la
     * jauge tomber, puis on apprend pourquoi elle est tombée si bas. Dans
     * l'autre sens, « Coup critique ! » annonçait un coup qui n'avait pas
     * encore eu lieu, et la jauge descendait une fois l'explication passée.
     */
    defenseur.hp = Math.max(0, defenseur.hp - frappe.degats)
    events.push({
      kind: 'damage',
      side,
      target: defenseur.name,
      amount: frappe.degats,
      hp: defenseur.hp,
      maxHp: defenseur.maxHp,
    })

    if (frappe.critique) events.push({ kind: 'critical' })
    if (frappe.efficacite !== 1) {
      events.push({ kind: 'effectiveness', multiplier: frappe.efficacite })
    }

    if (defenseur.hp === 0) {
      events.push({ kind: 'faint', side: cible, target: defenseur.name })
      if (equipeVaincue(suivant.teams[cible])) {
        suivant.winner = side
        events.push({ kind: 'win', side })
      }
    }
  }

  suivant.turn += 1
  // La graine avance avec le combat : chaque tour repart de la précédente,
  // donc une graine initiale suffit à rejouer la partie entière.
  suivant.seed = (rng() * 0xffffffff) >>> 0

  return { etat: suivant, events }
}

/** Envoi d'un remplaçant après un K.O. — gratuit, il ne consomme pas de tour. */
export function remplacer(
  etat: BattleState,
  side: Side,
  index: number,
): { etat: BattleState; events: BattleEvent[] } {
  const entrant = etat.teams[side].battlers[index]
  if (!entrant || entrant.hp <= 0) return { etat, events: [] }

  const suivant = cloner(etat)
  const equipe = suivant.teams[side]
  const sortant = equipe.battlers[equipe.active]
  equipe.active = index

  return {
    etat: suivant,
    events: [{ kind: 'switch', side, from: sortant.name, to: entrant.name, toIndex: index }],
  }
}
