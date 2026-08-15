import { CloseIcon } from '@/components/ui/icons'
import type { FiltersController } from '@/hooks/use-filters'
import type { Bounds, Category, RangeKey } from '@/lib/filters'
import { RANGE_KEYS } from '@/lib/filters'
import { formatHeight, formatWeight } from '@/lib/format'
import { GENERATIONS, STAT_LABELS_FR, typeColor, typeLabel } from '@/lib/pokemon-types'

const CATEGORY_LABELS: Record<Category, string> = {
  legendary: 'Légendaire',
  mythical: 'Fabuleux',
  baby: 'Bébé',
}

const RANGE_LABELS: Record<RangeKey, string> = {
  hp: STAT_LABELS_FR.hp,
  attack: STAT_LABELS_FR.attack,
  defense: STAT_LABELS_FR.defense,
  'special-attack': STAT_LABELS_FR['special-attack'],
  'special-defense': STAT_LABELS_FR['special-defense'],
  speed: STAT_LABELS_FR.speed,
  total: 'Total',
  height: 'Taille',
  weight: 'Poids',
}

function formatRangeValue(key: RangeKey, value: number) {
  if (key === 'height') return formatHeight(value)
  if (key === 'weight') return formatWeight(value)
  return String(value)
}

type ChipProps = {
  label: string
  onRemove: () => void
  color?: string
}

function Chip({ label, onRemove, color }: ChipProps) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full py-1 pr-1 pl-2.5 font-semibold text-xs"
      style={
        color
          ? { background: color, color: 'white' }
          : { background: 'var(--panel-soft)', color: 'var(--ink-soft)' }
      }
    >
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Retirer le filtre ${label}`}
        className="grid size-4 place-items-center rounded-full transition hover:bg-black/20"
      >
        <CloseIcon className="size-2.5" />
      </button>
    </span>
  )
}

type Props = {
  controller: FiltersController
  bounds: Bounds
}

export function ActiveFilterChips({ controller, bounds }: Props) {
  const { filters } = controller
  const activeRanges = RANGE_KEYS.filter((key) => filters.ranges[key])

  const hasAny =
    filters.types.length > 0 ||
    filters.generations.length > 0 ||
    filters.categories.length > 0 ||
    activeRanges.length > 0 ||
    filters.favoritesOnly

  if (!hasAny) return null

  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5">
      {filters.favoritesOnly && (
        <Chip
          label="Favoris"
          color="var(--color-type-fairy)"
          onRemove={() => controller.setFavoritesOnly(false)}
        />
      )}

      {filters.types.map((type) => (
        <Chip
          key={type}
          label={typeLabel(type)}
          color={typeColor(type)}
          onRemove={() => controller.toggleType(type)}
        />
      ))}

      {filters.generations.map((generation) => (
        <Chip
          key={generation}
          label={GENERATIONS.find((item) => item.id === generation)?.label ?? `Gen ${generation}`}
          onRemove={() => controller.toggleGeneration(generation)}
        />
      ))}

      {filters.categories.map((category) => (
        <Chip
          key={category}
          label={CATEGORY_LABELS[category]}
          onRemove={() => controller.toggleCategory(category)}
        />
      ))}

      {activeRanges.map((key) => {
        const range = filters.ranges[key]!
        const [min, max] = bounds[key]
        const parts: string[] = []
        if (range[0] > min) parts.push(`≥ ${formatRangeValue(key, range[0])}`)
        if (range[1] < max) parts.push(`≤ ${formatRangeValue(key, range[1])}`)

        return (
          <Chip
            key={key}
            label={`${RANGE_LABELS[key]} ${parts.join(' · ') || 'toutes valeurs'}`}
            onRemove={() => controller.setRange(key, null)}
          />
        )
      })}

      <button
        type="button"
        onClick={controller.reset}
        className="ml-1 font-semibold text-accent text-xs transition hover:underline"
      >
        Tout effacer
      </button>
    </div>
  )
}
