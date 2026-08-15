import { useCallback, useSyncExternalStore } from 'react'

export type SpriteMode = 'animated' | 'artwork'

const STORAGE_KEY = 'pokedex:sprite-mode'

function detect(): SpriteMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'animated' || stored === 'artwork') return stored
  } catch {
    // ignore
  }
  return 'animated'
}

let mode: SpriteMode = detect()
const listeners = new Set<() => void>()

export function setSpriteMode(next: SpriteMode) {
  mode = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // ignore
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => mode

/**
 * Sprites animés du jeu ou illustrations officielles, pour la grille
 * comme pour la fiche.
 *
 * Les animations sont le mode par défaut : la grille étant virtualisée,
 * seule une trentaine de sprites est chargée à la fois, et un GIF animé
 * (64 Ko en moyenne) pèse deux fois moins qu'une illustration officielle
 * (133 Ko). Les afficher coûte donc moins que de ne pas les afficher.
 */
export function useSpriteMode() {
  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const toggle = useCallback(
    () => setSpriteMode(value === 'animated' ? 'artwork' : 'animated'),
    [value],
  )
  return { mode: value, animated: value === 'animated', toggle, setSpriteMode }
}
