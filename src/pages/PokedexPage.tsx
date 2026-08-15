import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { Header } from '@/components/layout/Header'
import { PokemonGrid } from '@/components/grid/PokemonGrid'
import { EmptyState } from '@/components/grid/EmptyState'
import { FilterPanel } from '@/components/filters/FilterPanel'
import { FilterDrawer } from '@/components/filters/FilterDrawer'
import { ResultsBar } from '@/components/filters/ResultsBar'
import { ActiveFilterChips } from '@/components/filters/ActiveFilterChips'
import { PokemonDetailOverlay } from '@/components/detail/PokemonDetailOverlay'
import { ErrorScreen, LoadingScreen } from '@/components/ui/StateScreens'
import { useFavorites } from '@/hooks/use-favorites'
import { useFilters } from '@/hooks/use-filters'
import { usePokedex } from '@/hooks/use-pokedex'
import { applyFilters, computeBounds } from '@/lib/filters'

export function PokedexPage() {
  const { pokemon, byId, chart, isPending, isError, error, refetch } = usePokedex()
  const controller = useFilters()
  const { favorites } = useFavorites()
  const [drawerOpen, setDrawerOpen] = useState(false)

  const location = useLocation()
  const navigate = useNavigate()
  const params = useParams()

  // Le filtrage porte sur la valeur différée : la saisie reste fluide
  // même quand le résultat traverse les 1025 entrées.
  const deferredQuery = useDeferredValue(controller.filters.query)
  const effectiveFilters = useMemo(
    () => ({ ...controller.filters, query: deferredQuery }),
    [controller.filters, deferredQuery],
  )

  const results = useMemo(
    () => applyFilters(pokemon ?? [], effectiveFilters, favorites).results,
    [pokemon, effectiveFilters, favorites],
  )

  const bounds = useMemo(() => computeBounds(pokemon ?? []), [pokemon])

  const detailId = params.id ? Number(params.id) : null
  const closeDetail = useCallback(() => {
    navigate({ pathname: '/', search: location.search }, { preventScrollReset: true })
  }, [navigate, location.search])

  const openDetail = useCallback(
    (id: number) => {
      navigate({ pathname: `/pokemon/${id}`, search: location.search }, { preventScrollReset: true })
    },
    [navigate, location.search],
  )

  return (
    <div className="min-h-dvh">
      <Header
        query={controller.filters.query}
        onQueryChange={controller.setQuery}
        favoritesCount={favorites.size}
        favoritesOnly={controller.filters.favoritesOnly}
        onToggleFavorites={() => controller.setFavoritesOnly(!controller.filters.favoritesOnly)}
      />

      <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
        {isPending && <LoadingScreen />}

        {isError && (
          <ErrorScreen
            message={error instanceof Error ? error.message : 'Erreur inconnue'}
            onRetry={() => void refetch()}
          />
        )}

        {pokemon && (
          <div className="flex gap-6">
            <aside className="hidden w-72 shrink-0 lg:block">
              <div className="stable-gutter sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto pb-4">
                <FilterPanel controller={controller} bounds={bounds} pokemon={pokemon} />
              </div>
            </aside>

            <div className="min-w-0 flex-1">
              <ResultsBar
                controller={controller}
                count={results.length}
                total={pokemon.length}
                onOpenFilters={() => setDrawerOpen(true)}
              />

              <ActiveFilterChips controller={controller} bounds={bounds} />

              {results.length === 0 ? (
                <EmptyState onReset={controller.reset} />
              ) : (
                <PokemonGrid pokemon={results} search={location.search} />
              )}
            </div>
          </div>
        )}
      </main>

      <FilterDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        {pokemon && <FilterPanel controller={controller} bounds={bounds} pokemon={pokemon} />}
      </FilterDrawer>

      <AnimatePresence>
        {detailId !== null && chart && (
          <PokemonDetailOverlay
            key={detailId}
            id={detailId}
            chart={chart}
            summary={byId?.get(detailId)}
            onClose={closeDetail}
            onNavigate={openDetail}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
