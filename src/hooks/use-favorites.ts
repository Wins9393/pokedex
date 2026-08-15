import { useCallback, useSyncExternalStore } from 'react'

const STORAGE_KEY = 'pokedex:favorites'

function load(): ReadonlySet<number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((value): value is number => typeof value === 'number'))
  } catch {
    return new Set()
  }
}

let favorites: ReadonlySet<number> = load()
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...favorites]))
  } catch {
    // Quota plein ou navigation privée : les favoris restent en mémoire.
  }
}

export function toggleFavorite(id: number) {
  const next = new Set(favorites)
  if (!next.delete(id)) next.add(id)
  favorites = next
  persist()
  emit()
}

export function clearFavorites() {
  favorites = new Set()
  persist()
  emit()
}

// Garde les onglets ouverts en phase.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return
    favorites = load()
    emit()
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = () => favorites

/**
 * Store externe plutôt qu'un contexte : les 1025 cartes s'abonnent
 * directement, sans re-rendre tout l'arbre à chaque cœur cliqué.
 */
export function useFavorites() {
  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const isFavorite = useCallback((id: number) => value.has(id), [value])

  return { favorites: value, isFavorite, toggle: toggleFavorite, clear: clearFavorites }
}
