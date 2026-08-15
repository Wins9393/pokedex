import { TypeBadge } from '@/components/ui/TypeBadge'
import { computeMatchups, formatMultiplier, groupMatchups, multiplierTone } from '@/lib/type-chart'
import type { TypeChart } from '@/lib/type-chart'
import type { TypeName } from '@/lib/pokemon-types'

const TONE_STYLES: Record<ReturnType<typeof multiplierTone>, string> = {
  danger: 'bg-red-500/15 text-red-500',
  warn: 'bg-orange-500/15 text-orange-500',
  good: 'bg-emerald-500/15 text-emerald-500',
  immune: 'bg-ink-faint/15 text-ink-faint',
}

const TONE_TITLES: Record<ReturnType<typeof multiplierTone>, string> = {
  danger: 'Très vulnérable',
  warn: 'Vulnérable',
  good: 'Résistant',
  immune: 'Immunisé',
}

type Props = {
  chart: TypeChart
  types: readonly TypeName[]
}

/**
 * Multiplicateurs subis, calculés sur le double type. Le tableau change
 * donc quand on bascule sur une Méga ou une forme régionale.
 */
export function WeaknessGrid({ chart, types }: Props) {
  const groups = groupMatchups(computeMatchups(chart, types))

  if (!groups.length) {
    return <p className="text-ink-faint text-sm">Aucune faiblesse ni résistance particulière.</p>
  }

  return (
    <div className="space-y-2.5">
      {groups.map(({ multiplier, types: matched }) => {
        const tone = multiplierTone(multiplier)
        return (
          <div key={multiplier} className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex min-w-[3rem] justify-center rounded-lg px-2 py-1 font-black text-sm tabular-nums ${TONE_STYLES[tone]}`}
              title={TONE_TITLES[tone]}
            >
              {formatMultiplier(multiplier)}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {matched.map((type) => (
                <TypeBadge key={type} type={type} size="xs" />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
