import { useDeferredValue, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { PokemonSummary } from '@/api/models'
import { TypeBadge } from '@/components/ui/TypeBadge'
import { CloseIcon, SearchIcon } from '@/components/ui/icons'
import { TAILLE_EQUIPE } from '@/lib/battle/types'
import { searchScore } from '@/lib/filters'
import { formatDexNumber, normalizeText } from '@/lib/format'
import { typeGradient } from '@/lib/pokemon-types'
import { artworkUrl } from '@/lib/sprites'

const HAUTEUR_LIGNE = 68

type Props = {
  pokemon: PokemonSummary[]
  player: 1 | 2
  onDone: (ids: number[]) => void
}

export function TeamPicker({ pokemon, player, onDone }: Props) {
  const [query, setQuery] = useState('')
  const [choisis, setChoisis] = useState<number[]>([])
  const listeRef = useRef<HTMLDivElement>(null)

  // Même traitement que la grille : la recherche traverse 1025 entrées,
  // la valeur différée garde la frappe fluide.
  const differee = useDeferredValue(query)

  const resultats = useMemo(() => {
    const needle = normalizeText(differee)
    if (!needle) return pokemon

    return pokemon
      .map((entry) => ({ entry, score: searchScore(entry, needle) }))
      .filter((row): row is { entry: PokemonSummary; score: number } => row.score !== null)
      .sort((a, b) => b.score - a.score || a.entry.id - b.entry.id)
      .map((row) => row.entry)
  }, [pokemon, differee])

  const virtualizer = useVirtualizer({
    count: resultats.length,
    getScrollElement: () => listeRef.current,
    estimateSize: () => HAUTEUR_LIGNE,
    overscan: 8,
  })

  const basculer = (id: number) => {
    setChoisis((actuels) =>
      actuels.includes(id)
        ? actuels.filter((x) => x !== id)
        : actuels.length < TAILLE_EQUIPE
          ? [...actuels, id]
          : actuels,
    )
  }

  const parId = useMemo(() => new Map(pokemon.map((p) => [p.id, p])), [pokemon])
  const complet = choisis.length === TAILLE_EQUIPE

  return (
    /*
     * `h-dvh` et non `min-h-dvh` : avec une hauteur seulement minimale, la
     * colonne s'étire à la taille de son contenu, la zone en `overflow-y`
     * ne défile plus, et le virtualiseur — qui mesure la fenêtre visible —
     * conclut qu'il doit monter les 1025 lignes d'un coup.
     */
    <div className="flex h-dvh flex-col">
      <header className="glass sticky top-0 z-10 border-line border-b px-4 py-3 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="font-black text-ink text-xl tracking-tight">
              Joueur <span className="text-accent">{player}</span>
            </h1>
            <p className="text-ink-soft text-sm">
              {choisis.length} / {TAILLE_EQUIPE} Pokémon
            </p>
          </div>

          {/* Les emplacements restent visibles en permanence : c'est le
              retour qui dit ce qui a été choisi sans quitter la liste. */}
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: TAILLE_EQUIPE }, (_, index) => {
              const entry = choisis[index] ? parId.get(choisis[index]) : undefined

              // La clé est la position, jamais l'identifiant du Pokémon :
              // Bulbizarre (n° 1) entrerait sinon en collision avec la clé
              // de l'emplacement vide d'index 1.
              if (!entry) {
                return (
                  <div
                    key={index}
                    className="grid h-16 place-items-center rounded-2xl border border-line border-dashed text-ink-faint text-xs"
                  >
                    Emplacement {index + 1}
                  </div>
                )
              }

              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => basculer(entry.id)}
                  title={`Retirer ${entry.name}`}
                  className="relative flex h-16 items-center gap-1.5 overflow-hidden rounded-2xl border border-line px-2"
                  style={{ backgroundImage: typeGradient(entry.types, 24) }}
                >
                  <img
                    src={artworkUrl(entry.id)}
                    alt=""
                    loading="lazy"
                    className="size-11 shrink-0 object-contain"
                  />
                  <span className="min-w-0 flex-1 truncate text-left font-bold text-ink text-xs">
                    {entry.name}
                  </span>
                  <CloseIcon className="size-3.5 shrink-0 text-ink-faint" />
                </button>
              )
            })}
          </div>

          <div className="relative">
            <SearchIcon className="-translate-y-1/2 absolute top-1/2 left-3 size-4 text-ink-faint" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Chercher un Pokémon…"
              className="w-full rounded-full border border-line bg-panel-soft py-2.5 pr-4 pl-9 text-ink text-sm outline-none placeholder:text-ink-faint focus:border-accent"
            />
          </div>
        </div>
      </header>

      <div ref={listeRef} className="min-h-0 flex-1 overflow-y-auto px-4 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((ligne) => {
              const entry = resultats[ligne.index]
              const actif = choisis.includes(entry.id)
              const bloque = !actif && complet

              return (
                <div
                  key={entry.id}
                  className="absolute top-0 left-0 w-full pb-2"
                  style={{ height: HAUTEUR_LIGNE, transform: `translateY(${ligne.start}px)` }}
                >
                  <button
                    type="button"
                    onClick={() => basculer(entry.id)}
                    disabled={bloque}
                    aria-pressed={actif}
                    className={`flex size-full items-center gap-3 overflow-hidden rounded-2xl border px-3 text-left transition ${
                      actif
                        ? 'border-accent bg-panel-soft'
                        : bloque
                          ? 'border-line/50 opacity-40'
                          : 'border-line bg-panel-soft hover:border-ink-faint'
                    }`}
                    style={actif ? { backgroundImage: typeGradient(entry.types, 22) } : undefined}
                  >
                    <img
                      src={artworkUrl(entry.id)}
                      alt=""
                      loading="lazy"
                      className="size-12 shrink-0 object-contain"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="truncate font-bold text-ink">{entry.name}</span>
                        <span className="shrink-0 text-ink-faint text-xs tabular-nums">
                          {formatDexNumber(entry.id)}
                        </span>
                      </div>
                      <div className="mt-1 flex gap-1">
                        {entry.types.map((type) => (
                          <TypeBadge key={type} type={type} size="xs" />
                        ))}
                      </div>
                    </div>

                    <span className="shrink-0 text-right">
                      <span className="block font-bold text-ink text-sm tabular-nums">
                        {entry.statTotal}
                      </span>
                      <span className="block text-[10px] text-ink-faint uppercase">total</span>
                    </span>
                  </button>
                </div>
              )
            })}
          </div>

          {resultats.length === 0 && (
            <p className="py-16 text-center text-ink-faint">Aucun Pokémon ne correspond.</p>
          )}
        </div>
      </div>

      <footer className="glass sticky bottom-0 border-line border-t px-4 py-3 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <button
            type="button"
            disabled={!complet}
            onClick={() => onDone(choisis)}
            className={`w-full rounded-full py-3 font-bold transition ${
              complet
                ? 'bg-accent text-white'
                : 'cursor-not-allowed border border-line bg-panel-soft text-ink-faint'
            }`}
          >
            {complet
              ? 'Équipe prête'
              : `Choisis encore ${TAILLE_EQUIPE - choisis.length} Pokémon`}
          </button>
        </div>
      </footer>
    </div>
  )
}
