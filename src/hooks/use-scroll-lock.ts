import { useEffect } from 'react'

/**
 * Fige le défilement de la page pendant qu'une surcouche est ouverte.
 *
 * Deux contraintes se croisent ici :
 *
 * 1. Masquer l'`overflow` escamote la barre de défilement, la page gagne
 *    d'un coup sa largeur et toute l'interface se décale. On rend donc à
 *    `html` exactement la largeur perdue, sous forme de padding.
 * 2. Sortir le `body` du flux (`position: fixed`, la technique
 *    habituelle) fausse l'`offsetTop` sur lequel s'appuie la grille
 *    virtualisée, qui se met alors à afficher les mauvaises lignes. D'où
 *    le choix d'agir sur `html` sans jamais déplacer le `body`.
 *
 * Le compteur permet d'empiler deux verrous (tiroir de filtres puis
 * fiche) sans que la fermeture du premier ne relâche le second.
 */
let lockCount = 0
let previous: { overflow: string; paddingRight: string } | null = null

function lock() {
  if (lockCount++ > 0) return

  const root = document.documentElement
  previous = { overflow: root.style.overflow, paddingRight: root.style.paddingRight }

  // Largeur réelle de la barre : 0 avec les barres en surimpression.
  const scrollbarWidth = window.innerWidth - root.clientWidth
  root.style.overflow = 'hidden'

  if (scrollbarWidth > 0) {
    const current = Number.parseFloat(getComputedStyle(root).paddingRight) || 0
    root.style.paddingRight = `${current + scrollbarWidth}px`
  }
}

function unlock() {
  if (--lockCount > 0) return
  lockCount = 0
  if (!previous) return

  const root = document.documentElement
  root.style.overflow = previous.overflow
  root.style.paddingRight = previous.paddingRight
  previous = null
}

export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    lock()
    return unlock
  }, [active])
}
