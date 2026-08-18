import type { Move } from '@/api/models'
import type { Archetype } from './effects'
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

/**
 * Ce qu'un joueur retient pour un emplacement d'équipe. La forme et la
 * couleur se choisissent après le Pokémon, sur l'emplacement lui-même :
 * verser les 219 formes dans la liste ferait défiler trois Dracaufeu de
 * suite pour un choix qui ne concerne que 179 espèces.
 */
export type Choix = {
  /** Numéro de Pokédex national. */
  speciesId: number
  /** Identifiant de la forme retenue, `null` pour la forme par défaut. */
  formId: number | null
  shiny: boolean
}

/** Un Pokémon prêt à combattre, avec ses stats déjà calculées au niveau 50. */
export type Battler = {
  /** Numéro de Pokédex national : l'identité de l'espèce, pour l'affichage. */
  dexId: number
  /**
   * Identifiant du Pokémon-forme — 150 pour Mewtwo, 10043 pour Méga-Mewtwo X.
   * C'est lui qui adresse les sprites, et lui seul : afficher `dexId` sous
   * une Méga donnerait « n° 10043 » au lieu du numéro de l'espèce.
   */
  spriteId: number
  shiny: boolean
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
  // `archetype` voyage avec l'annonce plutôt que d'être retrouvé par le nom
  // de l'attaque : c'est l'interface qui joue le geste, à l'étape suivante,
  // et elle n'a alors plus que le récit sous la main.
  | { kind: 'move'; side: Side; user: string; move: string; type: TypeName; archetype: Archetype }
  | { kind: 'miss'; side: Side; user: string }
  | { kind: 'immune'; side: Side; target: string }
  | { kind: 'critical' }
  | { kind: 'effectiveness'; multiplier: number }
  | { kind: 'damage'; side: Side; target: string; amount: number; hp: number; maxHp: number }
  | { kind: 'faint'; side: Side; target: string }
  | { kind: 'win'; side: Side }

/* ------------------------------------------------------------------ *
 * Déroulé de la partie
 * ------------------------------------------------------------------ */

/**
 * Où en est la partie. Dans le modèle et non dans la page, parce que la
 * sauvegarde doit pouvoir le nommer — et parce que c'est bien une étape du
 * jeu, pas une préférence d'affichage.
 */
export type Ecran =
  | { kind: 'equipe'; joueur: 1 | 2 }
  | { kind: 'choix'; side: Side }
  | { kind: 'replay' }
  | { kind: 'remplacement'; side: Side }
  | { kind: 'fin' }

/** Écran de passage en attente : il masque l'écran suivant jusqu'au tap. */
export type Passage = { vers: 1 | 2; ecran: Ecran; detail?: string }
