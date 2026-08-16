import type { Move } from '@/api/models'
import type { StatName, TypeName } from '@/lib/pokemon-types'

/**
 * Tous les combattants sont au niveau 50, sans EV, sans IV variables et
 * sans nature. C'est le format des tournois officiels, et surtout le seul
 * qui reste équitable sans imposer un écran de configuration avant chaque
 * partie : deux joueurs qui choisissent le même Pokémon obtiennent
 * exactement les mêmes statistiques.
 */
export const NIVEAU = 50

/** Nombre de Pokémon par équipe. */
export const TAILLE_EQUIPE = 3

/** Nombre d'attaques par Pokémon. */
export const NB_ATTAQUES = 4

/** Une attaque en cours de combat : la fiche d'attaque plus ses PP restants. */
export type MoveSlot = {
  move: Move
  pp: number
  maxPp: number
}

/** Un Pokémon prêt à combattre, avec ses stats déjà calculées au niveau 50. */
export type Battler = {
  /** Numéro de Pokédex — sert aussi à retrouver les sprites. */
  id: number
  name: string
  types: TypeName[]
  /** Statistiques de combat au niveau 50, pas les statistiques de base. */
  stats: Record<StatName, number>
  hp: number
  maxHp: number
  moves: MoveSlot[]
}

/** 0 = joueur 1, 1 = joueur 2. */
export type Side = 0 | 1

export type Team = {
  battlers: Battler[]
  /** Index du Pokémon sur le terrain dans `battlers`. */
  active: number
}

export type BattleState = {
  teams: [Team, Team]
  turn: number
  winner: Side | null
  /**
   * Graine courante. Elle avance à chaque tour résolu, ce qui rend un
   * combat entier reproductible à partir de sa graine initiale — utile
   * pour tester, et indispensable le jour où les deux joueurs seront sur
   * deux téléphones qui doivent aboutir au même résultat.
   */
  seed: number
}

export type Action = { kind: 'move'; slot: number } | { kind: 'switch'; to: number }

/**
 * Le moteur ne renvoie pas seulement l'état final mais le récit du tour.
 * L'interface rejoue ces événements un par un : c'est ce qui donne le
 * journal de combat, le rythme des animations, et plus tard la
 * synchronisation entre deux téléphones sans rejouer le calcul.
 */
export type BattleEvent =
  // `toIndex` évite à l'interface de retrouver le remplaçant par son nom,
  // ce qui serait ambigu si une équipe alignait deux fois la même espèce.
  | { kind: 'switch'; side: Side; from: string; to: string; toIndex: number }
  | { kind: 'move'; side: Side; user: string; move: string; type: TypeName }
  | { kind: 'miss'; side: Side; user: string }
  | { kind: 'immune'; side: Side; target: string }
  | { kind: 'critical' }
  | { kind: 'effectiveness'; multiplier: number }
  | { kind: 'damage'; side: Side; target: string; amount: number; hp: number; maxHp: number }
  | { kind: 'faint'; side: Side; target: string }
  | { kind: 'win'; side: Side }
