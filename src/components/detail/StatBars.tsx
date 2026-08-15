import { motion, useReducedMotion } from 'motion/react'
import { STAT_LABELS_FR, STAT_MAX, STAT_ORDER, STAT_SHORT_FR } from '@/lib/pokemon-types'
import type { StatName } from '@/lib/pokemon-types'

/** Rouge pour une stat faible, vert pour une stat élevée. */
function statColor(value: number) {
  const ratio = Math.min(value / 160, 1)
  return `hsl(${Math.round(ratio * 132)} 72% 48%)`
}

type Props = {
  stats: Record<StatName, number>
  total: number
}

export function StatBars({ stats, total }: Props) {
  const reduced = useReducedMotion()

  return (
    <div className="space-y-2.5">
      {STAT_ORDER.map((stat, index) => {
        const value = stats[stat]
        const width = `${Math.min((value / STAT_MAX) * 100, 100)}%`

        return (
          <div
            key={stat}
            className="grid grid-cols-[3.75rem_2.25rem_1fr] items-center gap-2.5 sm:grid-cols-[7.5rem_2.5rem_1fr] sm:gap-3"
          >
            {/* Libellé abrégé sur mobile, sans quoi la jauge n'a plus de place. */}
            <span className="text-ink-soft text-xs">
              <span className="sm:hidden">{STAT_SHORT_FR[stat]}</span>
              <span className="hidden sm:inline">{STAT_LABELS_FR[stat]}</span>
            </span>
            <span className="text-right font-bold text-ink text-sm tabular-nums">{value}</span>
            <div className="h-2.5 overflow-hidden rounded-full bg-line">
              <motion.div
                className="h-full rounded-full"
                style={{ background: statColor(value) }}
                initial={reduced ? false : { width: 0 }}
                animate={{ width }}
                transition={{ duration: 0.6, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </div>
        )
      })}

      <div className="grid grid-cols-[3.75rem_2.25rem_1fr] items-center gap-2.5 border-line border-t pt-2.5 sm:grid-cols-[7.5rem_2.5rem_1fr] sm:gap-3">
        <span className="font-bold text-ink text-xs">Total</span>
        <span className="text-right font-black text-accent text-sm tabular-nums">{total}</span>
        <span className="text-ink-faint text-xs">
          {total >= 600 ? 'Pseudo-légendaire ou plus' : total >= 500 ? 'Solide' : 'Modeste'}
        </span>
      </div>
    </div>
  )
}
