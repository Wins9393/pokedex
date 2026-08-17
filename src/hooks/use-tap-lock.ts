import { useEffect, useState } from 'react'

/** Assez court pour être imperceptible, assez long pour absorber un double-tap. */
export const VERROU_TAP = 250

/**
 * Arme une zone tactile seulement après un court délai.
 *
 * Le mode combat empile des cibles plein écran : la surface qui déroule le
 * récit d'un tour, puis l'écran de passage juste dessous. Sans verrou, la
 * tape qui révèle la dernière réplique traverse vers l'écran de passage et
 * le franchit avant que le joueur suivant ait eu le temps de regarder — ou
 * pire, atteint le panneau d'attaques et engage un tour.
 *
 * Le même verrou empêche un double-tap involontaire de sauter une réplique,
 * puisqu'il se réarme à chaque changement de `cle`.
 *
 * Renvoie `false` tant que la zone doit ignorer les tapes.
 */
export function useTapLock(cle: unknown, delai = VERROU_TAP) {
  const [arme, setArme] = useState(false)

  useEffect(() => {
    setArme(false)
    const minuteur = window.setTimeout(() => setArme(true), delai)
    return () => window.clearTimeout(minuteur)
  }, [cle, delai])

  return arme
}
