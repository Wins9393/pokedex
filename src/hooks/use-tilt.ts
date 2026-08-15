import { useCallback, useRef } from 'react'
import { useReducedMotion } from 'motion/react'

/**
 * Inclinaison 3D suivant la souris. Le calcul écrit directement des
 * variables CSS sur le nœud plutôt que de passer par un state React :
 * avec une trentaine de cartes montées, un re-render par mouvement de
 * souris se verrait.
 */
export function useTilt(maxAngle = 9) {
  const ref = useRef<HTMLDivElement>(null)
  const reduced = useReducedMotion()

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const node = ref.current
      if (!node || reduced || event.pointerType === 'touch') return

      const rect = node.getBoundingClientRect()
      const x = (event.clientX - rect.left) / rect.width - 0.5
      const y = (event.clientY - rect.top) / rect.height - 0.5

      node.style.setProperty('--rx', `${(-y * maxAngle).toFixed(2)}deg`)
      node.style.setProperty('--ry', `${(x * maxAngle).toFixed(2)}deg`)
      node.style.setProperty('--gx', `${(x * 80 + 50).toFixed(1)}%`)
      node.style.setProperty('--gy', `${(y * 80 + 50).toFixed(1)}%`)
    },
    [maxAngle, reduced],
  )

  const onPointerLeave = useCallback(() => {
    const node = ref.current
    if (!node) return
    node.style.setProperty('--rx', '0deg')
    node.style.setProperty('--ry', '0deg')
    node.style.setProperty('--gx', '50%')
    node.style.setProperty('--gy', '50%')
  }, [])

  return { ref, onPointerMove, onPointerLeave }
}
