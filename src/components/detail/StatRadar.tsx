import { useId } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { STAT_ORDER, STAT_SHORT_FR, typeColor } from '@/lib/pokemon-types'
import type { StatName, TypeName } from '@/lib/pokemon-types'

const SIZE = 260
const CENTER = SIZE / 2
const RADIUS = 88
/** Au-delà, la forme sortirait du cadre : Leveinard (255 PV) est plafonné. */
const SCALE_MAX = 170
const RINGS = [0.25, 0.5, 0.75, 1]

const angleFor = (index: number) => (Math.PI * 2 * index) / STAT_ORDER.length - Math.PI / 2

function pointAt(index: number, ratio: number) {
  const angle = angleFor(index)
  return [CENTER + Math.cos(angle) * RADIUS * ratio, CENTER + Math.sin(angle) * RADIUS * ratio]
}

const polygon = (ratios: number[]) =>
  ratios.map((ratio, index) => pointAt(index, ratio).join(',')).join(' ')

type Props = {
  stats: Record<StatName, number>
  types: readonly TypeName[]
}

/**
 * Radar maison en SVG : une librairie de graphiques pour six points
 * serait plus lourde que le composant, et moins facile à teinter aux
 * couleurs du Pokémon.
 */
export function StatRadar({ stats, types }: Props) {
  const gradientId = useId()
  const reduced = useReducedMotion()

  const ratios = STAT_ORDER.map((stat) => Math.min(stats[stat] / SCALE_MAX, 1))
  const primary = typeColor(types[0] ?? 'normal')
  const secondary = typeColor(types[1] ?? types[0] ?? 'normal')

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="w-full max-w-[260px]"
      role="img"
      aria-label={`Répartition des statistiques : ${STAT_ORDER.map(
        (stat) => `${STAT_SHORT_FR[stat]} ${stats[stat]}`,
      ).join(', ')}`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={primary} stopOpacity="0.75" />
          <stop offset="100%" stopColor={secondary} stopOpacity="0.55" />
        </linearGradient>
      </defs>

      {RINGS.map((ring) => (
        <polygon
          key={ring}
          points={polygon(STAT_ORDER.map(() => ring))}
          fill="none"
          stroke="var(--line)"
          strokeWidth="1"
        />
      ))}

      {STAT_ORDER.map((stat, index) => {
        const [x, y] = pointAt(index, 1)
        return <line key={stat} x1={CENTER} y1={CENTER} x2={x} y2={y} stroke="var(--line)" strokeWidth="1" />
      })}

      <motion.polygon
        points={polygon(ratios)}
        fill={`url(#${gradientId})`}
        stroke={primary}
        strokeWidth="2.5"
        strokeLinejoin="round"
        initial={reduced ? false : { scale: 0.2, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}
      />

      {STAT_ORDER.map((stat, index) => {
        const [x, y] = pointAt(index, 1.24)
        return (
          <g key={stat}>
            <text
              x={x}
              y={y - 4}
              textAnchor="middle"
              className="fill-ink-faint font-semibold text-[9px] uppercase"
            >
              {STAT_SHORT_FR[stat]}
            </text>
            <text
              x={x}
              y={y + 8}
              textAnchor="middle"
              className="fill-ink font-bold text-[12px]"
            >
              {stats[stat]}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
