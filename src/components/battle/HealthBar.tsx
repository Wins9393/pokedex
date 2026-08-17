import { useEffect, useState } from 'react'
import {
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
} from 'motion/react'

type Props = {
  hp: number
  maxHp: number
  /** Les chiffres exacts ne sont montrés que du côté du joueur, comme dans les jeux. */
  chiffres?: boolean
  /**
   * Secondes d'attente avant que la jauge ne bouge — le temps que le coup
   * parcoure la scène. Sans ce retard les PV tomberaient au départ de
   * l'attaque, avant même qu'elle ait touché.
   */
  retard?: number
}

/**
 * Durée de la descente, en secondes.
 *
 * Exportée parce que le rejeu s'en sert : l'étape de dégâts n'a pas de
 * phrase, donc rien à lire, et s'enchaîne d'elle-même une fois la jauge
 * arrivée. Recopier la valeur là-bas la laisserait dériver de celle-ci — on
 * enchaînerait avant la fin de la descente, ou après un temps mort.
 */
export const DUREE_JAUGE = 0.55

/** Vert, orange, rouge — les trois paliers des jeux. */
type Palier = 'sain' | 'entame' | 'critique'

const palierDe = (ratio: number): Palier =>
  ratio > 0.5 ? 'sain' : ratio > 0.2 ? 'entame' : 'critique'

const TONS: Record<Palier, { barre: string; texte: string }> = {
  sain: { barre: 'bg-emerald-500', texte: 'text-emerald-500' },
  entame: { barre: 'bg-amber-400', texte: 'text-amber-500' },
  critique: { barre: 'bg-rose-500', texte: 'text-rose-500' },
}

/**
 * Les PV sont animés comme une valeur, pas seulement comme une largeur :
 * le chiffre et la couleur descendent avec la barre.
 *
 * Les faire dériver de la valeur finale — ce qu'on faisait tant que la
 * jauge partait à l'instant de la tape — les montrerait à l'arrivée avant
 * que la barre ait bougé. Depuis que le coup met le temps du trajet à
 * atteindre sa cible, cet écart annoncerait les dégâts avant l'impact.
 */
export function HealthBar({ hp, maxHp, chiffres = false, retard = 0 }: Props) {
  const reduit = useReducedMotion()
  const valeur = useMotionValue(hp)
  const [palier, setPalier] = useState(() => palierDe(maxHp > 0 ? hp / maxHp : 0))

  useEffect(() => {
    const controles = animate(
      valeur,
      hp,
      reduit ? { duration: 0 } : { duration: DUREE_JAUGE, delay: retard, ease: 'easeOut' },
    )
    return () => controles.stop()
  }, [hp, retard, reduit, valeur])

  // React ignore une mise à jour qui rend la même chaîne : le palier ne
  // provoque donc que deux rendus au plus, pas un par image.
  useMotionValueEvent(valeur, 'change', (courant) =>
    setPalier(palierDe(maxHp > 0 ? courant / maxHp : 0)),
  )

  const largeur = useTransform(
    valeur,
    (courant) => `${maxHp > 0 ? Math.min(1, Math.max(0, courant / maxHp)) * 100 : 0}%`,
  )
  const restants = useTransform(valeur, (courant) => Math.round(courant))
  const couleurs = TONS[palier]

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="font-black text-[10px] text-ink-faint uppercase tracking-wider">PV</span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
          <motion.div className={`h-full rounded-full ${couleurs.barre}`} style={{ width: largeur }} />
        </div>
      </div>

      {chiffres && (
        <p className={`text-right font-bold text-xs tabular-nums ${couleurs.texte}`}>
          <motion.span>{restants}</motion.span> / {maxHp}
        </p>
      )}
    </div>
  )
}
