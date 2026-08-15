import { useEffect, useRef, useState } from 'react'
import { CloseIcon, SearchIcon } from '@/components/ui/icons'

type Props = {
  value: string
  onChange: (value: string) => void
}

/**
 * L'état de la recherche vit dans l'URL, mais on garde une copie locale
 * pour que la frappe reste instantanée : l'URL n'est mise à jour qu'une
 * fois la saisie stabilisée.
 */
export function SearchBar({ value, onChange }: Props) {
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  // Resynchronise quand la valeur change ailleurs (reset, bouton retour).
  useEffect(() => {
    setDraft((current) => (current === value ? current : value))
  }, [value])

  useEffect(() => {
    if (draft === value) return
    const timer = setTimeout(() => onChange(draft), 140)
    return () => clearTimeout(timer)
  }, [draft, value, onChange])

  // « / » pour aller à la recherche, comme sur les sites de doc.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey) return
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      event.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="relative flex-1">
      <SearchIcon className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3.5 size-4.5 text-ink-faint" />
      <input
        ref={inputRef}
        type="search"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setDraft('')
        }}
        placeholder="Dracaufeu, charizard, 006…"
        aria-label="Rechercher un Pokémon"
        className="w-full rounded-full border border-line bg-panel-soft py-2.5 pr-10 pl-10 text-ink text-sm outline-none transition placeholder:text-ink-faint focus:border-accent/60 focus:bg-panel [&::-webkit-search-cancel-button]:hidden"
      />
      {draft && (
        <button
          type="button"
          onClick={() => setDraft('')}
          aria-label="Effacer la recherche"
          className="-translate-y-1/2 absolute top-1/2 right-3 grid size-6 place-items-center rounded-full text-ink-faint transition hover:bg-line hover:text-ink"
        >
          <CloseIcon className="size-3.5" />
        </button>
      )}
    </div>
  )
}
