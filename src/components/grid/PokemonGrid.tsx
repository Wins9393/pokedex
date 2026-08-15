import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import type { PokemonSummary } from '@/api/models'
import { PokemonCard } from './PokemonCard'

const GAP = 16
const MIN_CARD_WIDTH = 172
/**
 * Rapport hauteur/largeur d'une carte, hors gouttière. Volontairement
 * proche du carré : les illustrations le sont, donc une carte très
 * allongée ne ferait qu'ajouter du vide au-dessus et au-dessous du
 * Pokémon.
 */
const CARD_RATIO = 1.2

type Props = {
  pokemon: PokemonSummary[]
  /** Query string courante, recopiée dans les liens pour conserver les filtres. */
  search: string
}

/**
 * Grille virtualisée sur le scroll de la fenêtre : seules les lignes
 * visibles sont montées, ce qui permet d'afficher les 1025 Pokémon sans
 * pagination ni ralentissement.
 */
export function PokemonGrid({ pokemon, search }: Props) {
  const listRef = useRef<HTMLDivElement>(null)
  const [metrics, setMetrics] = useState({ width: 0, offsetTop: 0 })

  useLayoutEffect(() => {
    const node = listRef.current
    if (!node) return

    const measure = () => {
      setMetrics((previous) => {
        const width = node.getBoundingClientRect().width
        const offsetTop = node.offsetTop
        return previous.width === width && previous.offsetTop === offsetTop
          ? previous
          : { width, offsetTop }
      })
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    window.addEventListener('resize', measure)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  const columns = Math.max(2, Math.floor((metrics.width + GAP) / (MIN_CARD_WIDTH + GAP)))
  const columnWidth = (metrics.width - GAP * (columns - 1)) / columns
  const rowHeight = Math.round(columnWidth * CARD_RATIO) + GAP
  const rowCount = Math.ceil(pokemon.length / columns)

  const virtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => rowHeight,
    overscan: 4,
    scrollMargin: metrics.offsetTop,
  })

  // La hauteur de ligne dépend de la largeur : il faut réinvalider les
  // mesures mises en cache quand la fenêtre change de taille.
  useEffect(() => {
    virtualizer.measure()
  }, [rowHeight, virtualizer])

  return (
    <div ref={listRef} className="w-full">
      {metrics.width > 0 && (
        <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((row) => {
            const start = row.index * columns
            const rowItems = pokemon.slice(start, start + columns)

            return (
              <div
                key={row.key}
                className="absolute top-0 left-0 w-full"
                style={{
                  height: rowHeight,
                  transform: `translateY(${row.start - metrics.offsetTop}px)`,
                }}
              >
                <div
                  className="grid h-full"
                  style={{
                    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                    gap: GAP,
                    paddingBottom: GAP,
                  }}
                >
                  {rowItems.map((entry) => (
                    <PokemonCard
                      key={entry.id}
                      pokemon={entry}
                      to={`/pokemon/${entry.id}${search}`}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
