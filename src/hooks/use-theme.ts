import { useCallback, useSyncExternalStore } from 'react'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'pokedex:theme'

function detect(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'dark' || stored === 'light') return stored
  } catch {
    // ignore
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

let theme: Theme = detect()
const listeners = new Set<() => void>()

function apply(next: Theme) {
  document.documentElement.classList.toggle('dark', next === 'dark')
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', next === 'dark' ? '#080a12' : '#eceff7')
}

export function setTheme(next: Theme) {
  theme = next
  apply(next)
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

const getSnapshot = () => theme

export function useTheme() {
  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const toggle = useCallback(() => setTheme(value === 'dark' ? 'light' : 'dark'), [value])
  return { theme: value, toggle, setTheme }
}
