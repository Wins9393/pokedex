/**
 * Référentiel des 18 types : ordre canonique, libellés français et
 * helpers de couleur. Les couleurs vivent dans styles/index.css sous
 * forme de variables `--color-type-*`, ce qui permet de les injecter
 * dynamiquement dans n'importe quel style inline.
 */

import type { CSSProperties } from 'react'

export const TYPE_ORDER = [
  'normal',
  'fire',
  'water',
  'electric',
  'grass',
  'ice',
  'fighting',
  'poison',
  'ground',
  'flying',
  'psychic',
  'bug',
  'rock',
  'ghost',
  'dragon',
  'dark',
  'steel',
  'fairy',
] as const

export type TypeName = (typeof TYPE_ORDER)[number]

export const TYPE_LABELS_FR: Record<TypeName, string> = {
  normal: 'Normal',
  fire: 'Feu',
  water: 'Eau',
  electric: 'Électrik',
  grass: 'Plante',
  ice: 'Glace',
  fighting: 'Combat',
  poison: 'Poison',
  ground: 'Sol',
  flying: 'Vol',
  psychic: 'Psy',
  bug: 'Insecte',
  rock: 'Roche',
  ghost: 'Spectre',
  dragon: 'Dragon',
  dark: 'Ténèbres',
  steel: 'Acier',
  fairy: 'Fée',
}

/**
 * Identifiants réels de PokéAPI. Attention : ils ne suivent pas l'ordre
 * d'affichage ci-dessus mais l'ordre historique des jeux (Combat = 2,
 * Feu = 10…). Les déduire de la position fausse toute la matrice
 * d'efficacité.
 */
export const TYPE_BY_ID: Record<number, TypeName> = {
  1: 'normal',
  2: 'fighting',
  3: 'flying',
  4: 'poison',
  5: 'ground',
  6: 'rock',
  7: 'bug',
  8: 'ghost',
  9: 'steel',
  10: 'fire',
  11: 'water',
  12: 'grass',
  13: 'electric',
  14: 'psychic',
  15: 'ice',
  16: 'dragon',
  17: 'dark',
  18: 'fairy',
}

export const typeColor = (type: TypeName) => `var(--color-type-${type})`

export const typeLabel = (type: TypeName) => TYPE_LABELS_FR[type] ?? type

/**
 * Dégradé signature d'un Pokémon : construit à partir de son type
 * principal, teinté par le second s'il en a un.
 */
export function typeGradient(types: readonly TypeName[], strength = 100) {
  const primary = typeColor(types[0] ?? 'normal')
  const secondary = typeColor(types[1] ?? types[0] ?? 'normal')
  return `linear-gradient(140deg,
    color-mix(in oklab, ${primary} ${strength}%, transparent) 0%,
    color-mix(in oklab, ${secondary} ${strength * 0.72}%, transparent) 100%)`
}

/** Variables CSS à poser sur un conteneur pour que ses enfants héritent des couleurs de type. */
export function typeStyleVars(types: readonly TypeName[]): CSSProperties {
  return {
    '--t1': typeColor(types[0] ?? 'normal'),
    '--t2': typeColor(types[1] ?? types[0] ?? 'normal'),
  } as CSSProperties
}

/* ------------------------------------------------------------------ *
 * Stats
 * ------------------------------------------------------------------ */

export const STAT_ORDER = [
  'hp',
  'attack',
  'defense',
  'special-attack',
  'special-defense',
  'speed',
] as const

export type StatName = (typeof STAT_ORDER)[number]

export const STAT_LABELS_FR: Record<StatName, string> = {
  hp: 'PV',
  attack: 'Attaque',
  defense: 'Défense',
  'special-attack': 'Attaque Spéciale',
  'special-defense': 'Défense Spéciale',
  speed: 'Vitesse',
}

export const STAT_SHORT_FR: Record<StatName, string> = {
  hp: 'PV',
  attack: 'ATQ',
  defense: 'DÉF',
  'special-attack': 'ATQ SPÉ',
  'special-defense': 'DÉF SPÉ',
  speed: 'VIT',
}

/** Plafond utilisé pour les jauges (la stat max du jeu est 255, PV de Leveinard). */
export const STAT_MAX = 255

/* ------------------------------------------------------------------ *
 * Générations
 * ------------------------------------------------------------------ */

export const GENERATIONS = [
  { id: 1, label: 'Gen I', region: 'Kanto', range: '1 – 151' },
  { id: 2, label: 'Gen II', region: 'Johto', range: '152 – 251' },
  { id: 3, label: 'Gen III', region: 'Hoenn', range: '252 – 386' },
  { id: 4, label: 'Gen IV', region: 'Sinnoh', range: '387 – 493' },
  { id: 5, label: 'Gen V', region: 'Unys', range: '494 – 649' },
  { id: 6, label: 'Gen VI', region: 'Kalos', range: '650 – 721' },
  { id: 7, label: 'Gen VII', region: 'Alola', range: '722 – 809' },
  { id: 8, label: 'Gen VIII', region: 'Galar', range: '810 – 905' },
  { id: 9, label: 'Gen IX', region: 'Paldea', range: '906 – 1025' },
] as const
