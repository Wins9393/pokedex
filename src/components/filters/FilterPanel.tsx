import { useMemo, useState } from 'react'
import type { PokemonSummary } from '@/api/models'
import { RangeSlider } from '@/components/ui/RangeSlider'
import { ChevronDownIcon, HeartIcon } from '@/components/ui/icons'
import { useFavorites } from '@/hooks/use-favorites'
import type { FiltersController } from '@/hooks/use-filters'
import type { Bounds, Category } from '@/lib/filters'
import { countActiveFilters } from '@/lib/filters'
import { formatHeight, formatWeight } from '@/lib/format'
import { GENERATIONS, STAT_LABELS_FR, STAT_ORDER, TYPE_ORDER, typeColor, typeLabel } from '@/lib/pokemon-types'
import type { TypeName } from '@/lib/pokemon-types'

const CATEGORY_LABELS: Record<Category, string> = {
  legendary: 'Légendaire',
  mythical: 'Fabuleux',
  baby: 'Bébé',
}

type Props = {
  controller: FiltersController
  bounds: Bounds
  pokemon: PokemonSummary[]
}

function Section({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="border-line border-b px-4 py-4 last:border-b-0">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-bold text-[11px] text-ink-faint uppercase tracking-[0.12em]">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  )
}

export function FilterPanel({ controller, bounds, pokemon }: Props) {
  const { filters } = controller
  const { favorites } = useFavorites()
  const [showStats, setShowStats] = useState(false)
  const activeCount = countActiveFilters(filters)

  const typeCounts = useMemo(() => {
    const counts = new Map<TypeName, number>()
    for (const entry of pokemon) {
      for (const type of entry.types) counts.set(type, (counts.get(type) ?? 0) + 1)
    }
    return counts
  }, [pokemon])

  return (
    <div className="overflow-hidden rounded-card border border-line bg-panel">
      <div className="flex items-center justify-between gap-2 border-line border-b bg-panel-soft px-4 py-3">
        <span className="font-bold text-ink text-sm">
          Filtres
          {activeCount > 0 && (
            <span className="ml-2 rounded-full bg-accent px-2 py-0.5 font-semibold text-[11px] text-white">
              {activeCount}
            </span>
          )}
        </span>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={controller.reset}
            className="font-semibold text-accent text-xs transition hover:underline"
          >
            Tout effacer
          </button>
        )}
      </div>

      {/*
        Le filtre existait dans le modèle depuis toujours, mais sa seule
        commande vivait dans l'en-tête — absent du sélecteur d'équipe. Il
        était donc inatteignable là où il sert le plus : composer une équipe
        de combat parmi ses favoris.
      */}
      <Section title="Favoris">
        <button
          type="button"
          onClick={() => controller.setFavoritesOnly(!filters.favoritesOnly)}
          disabled={favorites.size === 0}
          aria-pressed={filters.favoritesOnly}
          className={`flex w-full items-center justify-between gap-2 rounded-full border px-3 py-2 font-semibold text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
            filters.favoritesOnly
              ? 'border-transparent bg-rose-500 text-white'
              : 'border-line bg-panel-soft text-ink-soft hover:text-ink'
          }`}
        >
          <span className="flex items-center gap-2">
            <HeartIcon className="size-4" filled={filters.favoritesOnly || favorites.size > 0} />
            Mes favoris uniquement
          </span>
          <span className="tabular-nums">{favorites.size}</span>
        </button>

        {favorites.size === 0 && (
          <p className="mt-2 text-ink-faint text-xs">
            Aucun favori pour l'instant — le cœur sur une carte ou une fiche en ajoute.
          </p>
        )}
      </Section>

      <Section
        title="Types"
        action={
          filters.types.length > 1 && (
            <div className="flex rounded-full bg-panel-soft p-0.5 text-[11px]">
              {(['any', 'all'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => controller.setTypeMode(mode)}
                  className={`rounded-full px-2.5 py-1 font-semibold transition ${
                    filters.typeMode === mode
                      ? 'bg-accent text-white'
                      : 'text-ink-faint hover:text-ink'
                  }`}
                  title={
                    mode === 'any'
                      ? 'Au moins un des types sélectionnés'
                      : 'Tous les types sélectionnés à la fois'
                  }
                >
                  {mode === 'any' ? 'OU' : 'ET'}
                </button>
              ))}
            </div>
          )
        }
      >
        <div className="grid grid-cols-2 gap-1.5">
          {TYPE_ORDER.map((type) => {
            const active = filters.types.includes(type)
            return (
              <button
                key={type}
                type="button"
                onClick={() => controller.toggleType(type)}
                aria-pressed={active}
                aria-label={`Type ${typeLabel(type)} — ${typeCounts.get(type) ?? 0} Pokémon`}
                className="flex items-center justify-between gap-1 rounded-lg px-2.5 py-1.5 font-semibold text-xs transition"
                style={
                  active
                    ? {
                        background: typeColor(type),
                        color: 'white',
                        boxShadow: `0 4px 12px -4px ${typeColor(type)}`,
                      }
                    : {
                        background: `color-mix(in oklab, ${typeColor(type)} 14%, transparent)`,
                        color: `color-mix(in oklab, ${typeColor(type)} 78%, var(--ink) 22%)`,
                      }
                }
              >
                <span className="truncate">{typeLabel(type)}</span>
                <span className="text-[10px] opacity-70 tabular-nums">
                  {typeCounts.get(type) ?? 0}
                </span>
              </button>
            )
          })}
        </div>
      </Section>

      <Section title="Générations">
        <div className="flex flex-wrap gap-1.5">
          {GENERATIONS.map((generation) => {
            const active = filters.generations.includes(generation.id)
            return (
              <button
                key={generation.id}
                type="button"
                onClick={() => controller.toggleGeneration(generation.id)}
                aria-pressed={active}
                title={`${generation.region} · ${generation.range}`}
                className={`rounded-lg px-2.5 py-1.5 font-semibold text-xs transition ${
                  active
                    ? 'bg-accent text-white'
                    : 'bg-panel-soft text-ink-soft hover:bg-line hover:text-ink'
                }`}
              >
                {generation.label}
              </button>
            )
          })}
        </div>
      </Section>

      <Section title="Catégories">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(CATEGORY_LABELS) as Category[]).map((category) => {
            const active = filters.categories.includes(category)
            return (
              <button
                key={category}
                type="button"
                onClick={() => controller.toggleCategory(category)}
                aria-pressed={active}
                className={`rounded-lg px-2.5 py-1.5 font-semibold text-xs transition ${
                  active
                    ? 'bg-accent text-white'
                    : 'bg-panel-soft text-ink-soft hover:bg-line hover:text-ink'
                }`}
              >
                {CATEGORY_LABELS[category]}
              </button>
            )
          })}
        </div>
      </Section>

      <Section title="Statistiques">
        <RangeSlider
          label="Total des stats"
          min={bounds.total[0]}
          max={bounds.total[1]}
          step={5}
          value={filters.ranges.total ?? null}
          onChange={(range) => controller.setRange('total', range)}
        />

        <button
          type="button"
          onClick={() => setShowStats((open) => !open)}
          aria-expanded={showStats}
          className="mt-2 flex w-full items-center justify-between rounded-lg px-1 py-1.5 font-semibold text-ink-soft text-xs transition hover:text-ink"
        >
          Détail par statistique
          <ChevronDownIcon
            className={`size-4 transition-transform ${showStats ? 'rotate-180' : ''}`}
          />
        </button>

        {showStats && (
          <div className="mt-1">
            {STAT_ORDER.map((stat) => (
              <RangeSlider
                key={stat}
                label={STAT_LABELS_FR[stat]}
                min={bounds[stat][0]}
                max={bounds[stat][1]}
                step={5}
                value={filters.ranges[stat] ?? null}
                onChange={(range) => controller.setRange(stat, range)}
              />
            ))}
          </div>
        )}
      </Section>

      <Section title="Gabarit">
        <RangeSlider
          label="Taille"
          min={bounds.height[0]}
          max={bounds.height[1]}
          step={1}
          value={filters.ranges.height ?? null}
          onChange={(range) => controller.setRange('height', range)}
          format={formatHeight}
        />
        <RangeSlider
          label="Poids"
          min={bounds.weight[0]}
          max={bounds.weight[1]}
          step={10}
          value={filters.ranges.weight ?? null}
          onChange={(range) => controller.setRange('weight', range)}
          format={formatWeight}
        />
      </Section>
    </div>
  )
}
