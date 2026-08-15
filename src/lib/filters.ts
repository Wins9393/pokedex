import type { PokemonSummary } from '@/api/models'
import { STAT_ORDER } from './pokemon-types'
import type { StatName, TypeName } from './pokemon-types'
import { normalizeText } from './format'

export type Category = 'legendary' | 'mythical' | 'baby'
export type TypeMode = 'any' | 'all'
export type SortKey = 'id' | 'name' | StatName | 'total' | 'height' | 'weight'
export type SortDir = 'asc' | 'desc'
export type RangeKey = StatName | 'total' | 'height' | 'weight'
export type Range = [number, number]

export type Filters = {
  query: string
  types: TypeName[]
  typeMode: TypeMode
  generations: number[]
  categories: Category[]
  ranges: Partial<Record<RangeKey, Range>>
  favoritesOnly: boolean
  sort: SortKey
  dir: SortDir
}

export const DEFAULT_FILTERS: Filters = {
  query: '',
  types: [],
  typeMode: 'any',
  generations: [],
  categories: [],
  ranges: {},
  favoritesOnly: false,
  sort: 'id',
  dir: 'asc',
}

export const RANGE_KEYS: RangeKey[] = [...STAT_ORDER, 'total', 'height', 'weight']

/** Bornes réelles calculées sur le jeu de données, pour caler les curseurs. */
export type Bounds = Record<RangeKey, Range>

export function computeBounds(pokemon: readonly PokemonSummary[]): Bounds {
  const bounds = {} as Bounds
  for (const key of RANGE_KEYS) bounds[key] = [Infinity, -Infinity]

  for (const entry of pokemon) {
    for (const key of RANGE_KEYS) {
      const value = valueOf(entry, key)
      const bound = bounds[key]
      if (value < bound[0]) bound[0] = value
      if (value > bound[1]) bound[1] = value
    }
  }

  for (const key of RANGE_KEYS) {
    if (!Number.isFinite(bounds[key][0])) bounds[key] = [0, 0]
  }
  return bounds
}

function valueOf(entry: PokemonSummary, key: RangeKey): number {
  if (key === 'total') return entry.statTotal
  if (key === 'height') return entry.height
  if (key === 'weight') return entry.weight
  return entry.stats[key]
}

/* ------------------------------------------------------------------ *
 * Recherche
 * ------------------------------------------------------------------ */

/**
 * Sous-séquence tolérante : « drcf » retrouve « dracaufeu ». Le score
 * favorise les correspondances compactes et proches du début du mot.
 */
function subsequenceScore(haystack: string, needle: string): number | null {
  let index = 0
  let first = -1
  let last = 0

  for (const char of needle) {
    const found = haystack.indexOf(char, index)
    if (found === -1) return null
    if (first === -1) first = found
    last = found
    index = found + 1
  }

  const span = last - first + 1
  const compactness = needle.length / span
  const earliness = 1 - first / Math.max(haystack.length, 1)
  return compactness * 0.7 + earliness * 0.3
}

/**
 * Retourne un score de pertinence, ou `null` si l'entrée ne correspond
 * pas. Les paliers sont volontairement très espacés pour que le tri par
 * pertinence reste lisible.
 */
export function searchScore(entry: PokemonSummary, needle: string): number | null {
  if (!needle) return 0

  const { nameKey, slugKey, id } = entry

  if (nameKey === needle || slugKey === needle) return 1000

  if (/^\d+$/.test(needle)) {
    const asNumber = Number(needle)
    if (id === asNumber) return 990
    if (String(id).startsWith(needle)) return 520
    return null
  }

  if (nameKey.startsWith(needle)) return 900
  if (slugKey.startsWith(needle)) return 860
  if (nameKey.includes(needle)) return 700
  if (slugKey.includes(needle)) return 660

  if (needle.length >= 3) {
    const fuzzy = subsequenceScore(nameKey, needle) ?? subsequenceScore(slugKey, needle)
    if (fuzzy !== null) return 300 + fuzzy * 100
  }

  return null
}

/* ------------------------------------------------------------------ *
 * Filtrage et tri
 * ------------------------------------------------------------------ */

function matchesCategories(entry: PokemonSummary, categories: Category[]): boolean {
  if (!categories.length) return true
  return categories.some(
    (category) =>
      (category === 'legendary' && entry.isLegendary) ||
      (category === 'mythical' && entry.isMythical) ||
      (category === 'baby' && entry.isBaby),
  )
}

function matchesTypes(entry: PokemonSummary, types: TypeName[], mode: TypeMode): boolean {
  if (!types.length) return true
  return mode === 'all'
    ? types.every((type) => entry.types.includes(type))
    : types.some((type) => entry.types.includes(type))
}

function matchesRanges(entry: PokemonSummary, ranges: Filters['ranges']): boolean {
  for (const key of RANGE_KEYS) {
    const range = ranges[key]
    if (!range) continue
    const value = valueOf(entry, key)
    if (value < range[0] || value > range[1]) return false
  }
  return true
}

const collator = new Intl.Collator('fr', { sensitivity: 'base' })

function compare(a: PokemonSummary, b: PokemonSummary, sort: SortKey): number {
  if (sort === 'id') return a.id - b.id
  if (sort === 'name') return collator.compare(a.name, b.name)
  return valueOf(a, sort) - valueOf(b, sort)
}

export type FilterResult = {
  results: PokemonSummary[]
  /** Nombre d'entrées écartées par les filtres actifs, pour l'affichage. */
  total: number
}

export function applyFilters(
  pokemon: readonly PokemonSummary[],
  filters: Filters,
  favorites: ReadonlySet<number>,
): FilterResult {
  const needle = normalizeText(filters.query)
  const scored: { entry: PokemonSummary; score: number }[] = []

  for (const entry of pokemon) {
    if (filters.favoritesOnly && !favorites.has(entry.id)) continue
    if (filters.generations.length && !filters.generations.includes(entry.generation)) continue
    if (!matchesTypes(entry, filters.types, filters.typeMode)) continue
    if (!matchesCategories(entry, filters.categories)) continue
    if (!matchesRanges(entry, filters.ranges)) continue

    const score = searchScore(entry, needle)
    if (score === null) continue

    scored.push({ entry, score })
  }

  // Une recherche textuelle impose le tri par pertinence : afficher
  // Dracaufeu en 6e position parce qu'on trie par numéro serait absurde.
  if (needle) {
    scored.sort((a, b) => b.score - a.score || a.entry.id - b.entry.id)
  } else {
    const direction = filters.dir === 'asc' ? 1 : -1
    scored.sort((a, b) => compare(a.entry, b.entry, filters.sort) * direction)
  }

  return { results: scored.map((item) => item.entry), total: pokemon.length }
}

/** Nombre de filtres actifs, hors recherche et tri (pour le badge du panneau). */
export function countActiveFilters(filters: Filters): number {
  return (
    filters.types.length +
    filters.generations.length +
    filters.categories.length +
    Object.keys(filters.ranges).length +
    (filters.favoritesOnly ? 1 : 0)
  )
}
