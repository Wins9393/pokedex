import { SlidersIcon } from '@/components/ui/icons'
import type { FiltersController } from '@/hooks/use-filters'
import { countActiveFilters } from '@/lib/filters'
import type { SortKey } from '@/lib/filters'
import { STAT_LABELS_FR, STAT_ORDER } from '@/lib/pokemon-types'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'id', label: 'Numéro' },
  { value: 'name', label: 'Nom' },
  { value: 'total', label: 'Total des stats' },
  ...STAT_ORDER.map((stat) => ({ value: stat as SortKey, label: STAT_LABELS_FR[stat] })),
  { value: 'height', label: 'Taille' },
  { value: 'weight', label: 'Poids' },
]

type Props = {
  controller: FiltersController
  count: number
  total: number
  onOpenFilters: () => void
  /**
   * Le bouton s'efface au-delà de `lg`, où la grille montre une colonne de
   * filtres permanente. La sélection d'équipe n'en a pas : elle le garde.
   */
  filtresToujoursVisibles?: boolean
}

export function ResultsBar({
  controller,
  count,
  total,
  onOpenFilters,
  filtresToujoursVisibles = false,
}: Props) {
  const { filters } = controller
  const searching = filters.query.trim().length > 0
  const activeCount = countActiveFilters(filters)

  return (
    /* Pas de marge propre : la barre est posée dans un conteneur collant
       d'un côté, dans un en-tête de l'autre, chacun gérant son espacement. */
    <div className="flex flex-wrap items-center gap-3">
      <p className="font-semibold text-ink text-sm">
        <span className="text-accent tabular-nums">{count}</span>
        <span className="text-ink-soft"> / {total} Pokémon</span>
      </p>

      <div className="ml-auto flex items-center gap-2">
        {searching ? (
          <span className="rounded-full bg-panel-soft px-3 py-1.5 text-ink-faint text-xs">
            Tri par pertinence
          </span>
        ) : (
          <div className="flex items-center gap-1.5">
            <label htmlFor="sort" className="sr-only">
              Trier par
            </label>
            <select
              id="sort"
              value={filters.sort}
              onChange={(event) => controller.setSort(event.target.value as SortKey, filters.dir)}
              className="rounded-full border border-line bg-panel-soft px-3 py-1.5 text-ink text-xs outline-none transition hover:border-accent/50 focus:border-accent"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() =>
                controller.setSort(filters.sort, filters.dir === 'asc' ? 'desc' : 'asc')
              }
              aria-label={filters.dir === 'asc' ? 'Tri croissant' : 'Tri décroissant'}
              title={filters.dir === 'asc' ? 'Croissant' : 'Décroissant'}
              className="grid size-8 place-items-center rounded-full border border-line bg-panel-soft text-ink-soft transition hover:text-ink"
            >
              <span aria-hidden="true" className="text-sm">
                {filters.dir === 'asc' ? '↑' : '↓'}
              </span>
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={onOpenFilters}
          className={`flex items-center gap-1.5 rounded-full border border-line bg-panel-soft px-3 py-1.5 font-semibold text-ink-soft text-xs transition hover:text-ink ${
            filtresToujoursVisibles ? '' : 'lg:hidden'
          }`}
        >
          <SlidersIcon className="size-4" />
          Filtres
          {activeCount > 0 && (
            <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] text-white">
              {activeCount}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}
