import { useId } from 'react'
import { CloseIcon } from './icons'

type Props = {
  label: string
  min: number
  max: number
  step?: number
  value: [number, number] | null
  onChange: (range: [number, number] | null) => void
  format?: (value: number) => string
}

export function RangeSlider({
  label,
  min,
  max,
  step = 1,
  value,
  onChange,
  format = String,
}: Props) {
  const id = useId()
  const active = value !== null
  const [low, high] = value ?? [min, max]

  const span = Math.max(max - min, 1)
  const lowPercent = ((low - min) / span) * 100
  const highPercent = ((high - min) / span) * 100

  const update = (next: [number, number]) => {
    // Repasser sur les bornes complètes équivaut à retirer le filtre.
    if (next[0] <= min && next[1] >= max) onChange(null)
    else onChange(next)
  }

  return (
    <div className="py-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={`${id}-min`} className="font-medium text-ink-soft text-xs">
          {label}
        </label>
        <div className="flex items-center gap-1.5">
          <span
            className={`font-semibold text-xs tabular-nums ${active ? 'text-accent' : 'text-ink-faint'}`}
          >
            {format(low)} – {format(high)}
          </span>
          {active && (
            <button
              type="button"
              onClick={() => onChange(null)}
              aria-label={`Retirer le filtre ${label}`}
              className="grid size-4 place-items-center rounded-full text-ink-faint transition hover:bg-line hover:text-ink"
            >
              <CloseIcon className="size-2.5" />
            </button>
          )}
        </div>
      </div>

      <div className="relative mt-2 h-5">
        <div className="-translate-y-1/2 absolute inset-x-0 top-1/2 h-1.5 rounded-full bg-line" />
        <div
          className="-translate-y-1/2 absolute top-1/2 h-1.5 rounded-full bg-accent"
          style={{ left: `${lowPercent}%`, width: `${Math.max(highPercent - lowPercent, 0)}%` }}
        />
        <input
          id={`${id}-min`}
          type="range"
          className="range-input"
          min={min}
          max={max}
          step={step}
          value={low}
          aria-label={`${label} — minimum`}
          onChange={(event) => update([Math.min(Number(event.target.value), high), high])}
        />
        <input
          type="range"
          className="range-input"
          min={min}
          max={max}
          step={step}
          value={high}
          aria-label={`${label} — maximum`}
          onChange={(event) => update([low, Math.max(Number(event.target.value), low)])}
        />
      </div>
    </div>
  )
}
