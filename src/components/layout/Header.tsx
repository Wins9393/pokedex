import { SearchBar } from '@/components/filters/SearchBar'
import { OfflineButton } from '@/components/layout/OfflineButton'
import { HeartIcon, MoonIcon, PixelSpriteIcon, PokeballIcon, SunIcon } from '@/components/ui/icons'
import { useSpriteMode } from '@/hooks/use-sprite-mode'
import { useTheme } from '@/hooks/use-theme'

type Props = {
  query: string
  onQueryChange: (value: string) => void
  favoritesCount: number
  favoritesOnly: boolean
  onToggleFavorites: () => void
}

export function Header({
  query,
  onQueryChange,
  favoritesCount,
  favoritesOnly,
  onToggleFavorites,
}: Props) {
  const { theme, toggle } = useTheme()
  const sprites = useSpriteMode()

  return (
    <header className="glass sticky top-0 z-40 border-line border-b">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <PokeballIcon className="size-8 text-accent" />
          <span className="font-black text-ink text-xl tracking-tight">
            Poké<span className="text-accent">dex</span>
          </span>
        </div>

        <div className="order-3 flex w-full items-center gap-2 sm:order-none sm:w-auto sm:flex-1">
          <SearchBar value={query} onChange={onQueryChange} />
        </div>

        <div className="ml-auto flex items-center gap-2 sm:ml-0">
          <button
            type="button"
            onClick={onToggleFavorites}
            aria-pressed={favoritesOnly}
            title="Afficher uniquement mes favoris"
            className={`flex items-center gap-1.5 rounded-full border px-3 py-2 font-semibold text-sm transition ${
              favoritesOnly
                ? 'border-transparent bg-rose-500 text-white'
                : 'border-line bg-panel-soft text-ink-soft hover:text-ink'
            }`}
          >
            <HeartIcon className="size-4" filled={favoritesOnly || favoritesCount > 0} />
            <span className="tabular-nums">{favoritesCount}</span>
            <span className="sr-only">favoris</span>
          </button>

          <button
            type="button"
            onClick={sprites.toggle}
            aria-pressed={sprites.animated}
            title={
              sprites.animated
                ? 'Afficher les illustrations officielles'
                : 'Afficher les sprites animés du jeu'
            }
            aria-label={
              sprites.animated
                ? 'Afficher les illustrations officielles'
                : 'Afficher les sprites animés du jeu'
            }
            className={`grid size-9 place-items-center rounded-full border transition ${
              sprites.animated
                ? 'border-transparent bg-accent text-white'
                : 'border-line bg-panel-soft text-ink-soft hover:text-ink'
            }`}
          >
            <PixelSpriteIcon className="size-4.5" />
          </button>

          <OfflineButton />

          <button
            type="button"
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre'}
            className="grid size-9 place-items-center rounded-full border border-line bg-panel-soft text-ink-soft transition hover:text-ink"
          >
            {theme === 'dark' ? <SunIcon className="size-4.5" /> : <MoonIcon className="size-4.5" />}
          </button>
        </div>
      </div>
    </header>
  )
}
