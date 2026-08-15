import { useQuery } from '@tanstack/react-query'
import { gql } from '@/api/client'
import { DETAIL_QUERY, INDEX_QUERY } from '@/api/queries'
import { normalizeDetail, normalizeIndex } from '@/api/normalize'
import type { RawDetailResponse, RawIndexResponse } from '@/api/normalize'
import type { PokedexIndexData, PokemonSummary } from '@/api/models'
import { buildTypeChart } from '@/lib/type-chart'
import type { TypeChart } from '@/lib/type-chart'

export const INDEX_QUERY_KEY = ['pokedex', 'index'] as const

type Derived = {
  byId: Map<number, PokemonSummary>
  chart: TypeChart
}

/**
 * Les structures dérivées (index par numéro, matrice de types) sont
 * coûteuses à reconstruire et identiques pour tous les composants. On les
 * mémorise ici sur la référence des données plutôt que dans chaque
 * `useMemo`, qui recalculerait par instance.
 */
let derivedCache: { source: PokedexIndexData; derived: Derived } | null = null

function derive(data: PokedexIndexData): Derived {
  if (derivedCache?.source === data) return derivedCache.derived

  const derived: Derived = {
    byId: new Map(data.pokemon.map((entry) => [entry.id, entry])),
    chart: buildTypeChart(data.efficacy),
  }
  derivedCache = { source: data, derived }
  return derived
}

/** L'index complet : 1025 espèces + matrice des types, en une requête. */
export function usePokedex() {
  const query = useQuery({
    queryKey: INDEX_QUERY_KEY,
    queryFn: async ({ signal }) =>
      normalizeIndex(await gql<RawIndexResponse>(INDEX_QUERY, undefined, signal)),
    staleTime: Infinity,
    gcTime: Infinity,
  })

  const derived = query.data ? derive(query.data) : null

  return {
    pokemon: query.data?.pokemon,
    byId: derived?.byId,
    chart: derived?.chart,
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}

/** Fiche détaillée d'une espèce, chargée à la demande. */
export function usePokemonDetail(id: number | null) {
  return useQuery({
    queryKey: ['pokedex', 'detail', id],
    queryFn: async ({ signal }) =>
      normalizeDetail(await gql<RawDetailResponse>(DETAIL_QUERY, { id }, signal)),
    enabled: id != null,
    staleTime: Infinity,
  })
}
