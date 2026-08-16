import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { DEFAULT_FILTERS, RANGE_KEYS } from '@/lib/filters'
import type { Category, Filters, Range, RangeKey, SortDir, SortKey, TypeMode } from '@/lib/filters'
import { TYPE_ORDER } from '@/lib/pokemon-types'
import type { TypeName } from '@/lib/pokemon-types'

/** Noms courts dans l'URL : `?tot=500-800&atk=100-255` reste lisible. */
const RANGE_PARAM: Record<RangeKey, string> = {
  hp: 'hp',
  attack: 'atk',
  defense: 'def',
  'special-attack': 'spa',
  'special-defense': 'spd',
  speed: 'spe',
  total: 'tot',
  height: 'h',
  weight: 'w',
}

const CATEGORIES: Category[] = ['legendary', 'mythical', 'baby']
const SORT_KEYS: SortKey[] = [...RANGE_KEYS, 'id', 'name']

const splitList = (value: string | null) => (value ? value.split(',').filter(Boolean) : [])

function parseRange(value: string | null): Range | null {
  if (!value) return null
  const [min, max] = value.split('-').map(Number)
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null
  return [min, max]
}

function parseFilters(params: URLSearchParams): Filters {
  const ranges: Filters['ranges'] = {}
  for (const key of RANGE_KEYS) {
    const range = parseRange(params.get(RANGE_PARAM[key]))
    if (range) ranges[key] = range
  }

  const sort = params.get('sort') as SortKey | null
  const dir = params.get('dir')

  return {
    query: params.get('q') ?? '',
    types: splitList(params.get('types')).filter((t): t is TypeName =>
      (TYPE_ORDER as readonly string[]).includes(t),
    ),
    typeMode: params.get('tmode') === 'all' ? 'all' : 'any',
    generations: splitList(params.get('gen'))
      .map(Number)
      .filter((n) => n >= 1 && n <= 9),
    categories: splitList(params.get('cat')).filter((c): c is Category =>
      (CATEGORIES as string[]).includes(c),
    ),
    ranges,
    favoritesOnly: params.get('fav') === '1',
    sort: sort && SORT_KEYS.includes(sort) ? sort : 'id',
    dir: dir === 'desc' ? 'desc' : 'asc',
  }
}

/** N'écrit dans l'URL que ce qui diffère de l'état par défaut. */
function serializeFilters(filters: Filters): URLSearchParams {
  const params = new URLSearchParams()

  if (filters.query) params.set('q', filters.query)
  if (filters.types.length) params.set('types', filters.types.join(','))
  if (filters.typeMode !== 'any') params.set('tmode', filters.typeMode)
  if (filters.generations.length) params.set('gen', filters.generations.join(','))
  if (filters.categories.length) params.set('cat', filters.categories.join(','))
  if (filters.favoritesOnly) params.set('fav', '1')
  if (filters.sort !== DEFAULT_FILTERS.sort) params.set('sort', filters.sort)
  if (filters.dir !== DEFAULT_FILTERS.dir) params.set('dir', filters.dir)

  for (const key of RANGE_KEYS) {
    const range = filters.ranges[key]
    if (range) params.set(RANGE_PARAM[key], `${range[0]}-${range[1]}`)
  }

  return params
}

function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

/**
 * Les actions de filtrage, indépendantes de l'endroit où l'état est rangé.
 * C'est ce qui permet aux mêmes panneau, tiroir et chips de servir la
 * grille — dont les filtres vivent dans l'URL — et la sélection d'équipe,
 * où ils sont locaux.
 */
function creerControleur(
  filters: Filters,
  update: (patch: Partial<Filters>) => void,
  reset: () => void,
) {
  return {
    filters,
    update,
    reset,
    setQuery: (query: string) => update({ query }),
    toggleType: (type: TypeName) => update({ types: toggleValue(filters.types, type) }),
    setTypeMode: (typeMode: TypeMode) => update({ typeMode }),
    toggleGeneration: (generation: number) =>
      update({ generations: toggleValue(filters.generations, generation) }),
    toggleCategory: (category: Category) =>
      update({ categories: toggleValue(filters.categories, category) }),
    setRange: (key: RangeKey, range: Range | null) => {
      const ranges = { ...filters.ranges }
      if (range) ranges[key] = range
      else delete ranges[key]
      update({ ranges })
    },
    setFavoritesOnly: (favoritesOnly: boolean) => update({ favoritesOnly }),
    setSort: (sort: SortKey, dir: SortDir) => update({ sort, dir }),
  }
}

/**
 * L'état des filtres vit dans l'URL : une vue filtrée se partage, se
 * met en favori et survit à un rechargement.
 */
export function useFilters(): FiltersController {
  const [params, setParams] = useSearchParams()

  const filters = useMemo(() => parseFilters(params), [params])

  const update = useCallback(
    (patch: Partial<Filters>) => {
      setParams(
        (previous) => serializeFilters({ ...parseFilters(previous), ...patch }),
        { replace: true, preventScrollReset: true },
      )
    },
    [setParams],
  )

  const reset = useCallback(
    () => setParams(new URLSearchParams(), { replace: true, preventScrollReset: true }),
    [setParams],
  )

  return useMemo(() => creerControleur(filters, update, reset), [filters, update, reset])
}

/**
 * Variante à état local, pour la sélection d'équipe du mode combat.
 *
 * L'URL n'aurait pas convenu : les filtres du joueur 1 se transmettraient
 * au joueur 2, qui ouvrirait une liste déjà restreinte sans savoir
 * pourquoi. Chaque joueur repart donc d'une ardoise vierge — le sélecteur
 * étant monté avec une clé par joueur, l'état se réinitialise tout seul.
 */
export function useLocalFilters(): FiltersController {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)

  const update = useCallback(
    (patch: Partial<Filters>) => setFilters((previous) => ({ ...previous, ...patch })),
    [],
  )
  const reset = useCallback(() => setFilters(DEFAULT_FILTERS), [])

  return useMemo(() => creerControleur(filters, update, reset), [filters, update, reset])
}

export type FiltersController = ReturnType<typeof creerControleur>
