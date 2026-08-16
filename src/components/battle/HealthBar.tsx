import { motion, useReducedMotion } from 'motion/react'

type Props = {
  hp: number
  maxHp: number
  /** Les chiffres exacts ne sont montrés que du côté du joueur, comme dans les jeux. */
  chiffres?: boolean
}

/** Vert, orange, rouge — les trois paliers des jeux. */
function ton(ratio: number) {
  if (ratio > 0.5) return { barre: 'bg-emerald-500', texte: 'text-emerald-500' }
  if (ratio > 0.2) return { barre: 'bg-amber-400', texte: 'text-amber-500' }
  return { barre: 'bg-rose-500', texte: 'text-rose-500' }
}

export function HealthBar({ hp, maxHp, chiffres = false }: Props) {
  const reduit = useReducedMotion()
  const ratio = maxHp > 0 ? Math.max(0, hp / maxHp) : 0
  const couleurs = ton(ratio)

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="font-black text-[10px] text-ink-faint uppercase tracking-wider">PV</span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
          <motion.div
            className={`h-full rounded-full ${couleurs.barre}`}
            initial={false}
            animate={{ width: `${ratio * 100}%` }}
            transition={reduit ? { duration: 0 } : { duration: 0.55, ease: 'easeOut' }}
          />
        </div>
      </div>

      {chiffres && (
        <p className={`text-right font-bold text-xs tabular-nums ${couleurs.texte}`}>
          {hp} / {maxHp}
        </p>
      )}
    </div>
  )
}
