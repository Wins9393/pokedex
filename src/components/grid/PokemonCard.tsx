import { memo, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { Link } from 'react-router'
import type { PokemonSummary } from '@/api/models'
import { TypeBadge } from '@/components/ui/TypeBadge'
import { HeartIcon } from '@/components/ui/icons'
import { useFavorites } from '@/hooks/use-favorites'
import { useReparationImage } from '@/hooks/use-reparation-image'
import { useSpriteMode } from '@/hooks/use-sprite-mode'
import { useTilt } from '@/hooks/use-tilt'
import { formatDexNumber } from '@/lib/format'
import { typeStyleVars } from '@/lib/pokemon-types'
import { artworkUrl, showdownUrl } from '@/lib/sprites'

type Props = {
  pokemon: PokemonSummary
  /** URL de la fiche, calculée par la grille pour conserver les filtres actifs. */
  to: string
}

function PokemonCardBase({ pokemon, to }: Props) {
  const { isFavorite, toggle } = useFavorites()
  const favorite = isFavorite(pokemon.id)
  const tilt = useTilt()
  const reduced = useReducedMotion()

  const { animated: animatedMode } = useSpriteMode()

  const [hovered, setHovered] = useState(false)
  const [requested, setRequested] = useState(false)
  const [animState, setAnimState] = useState<'loading' | 'ready' | 'failed'>('loading')
  /*
   * L'illustration n'a aucun repli : c'est le visuel de la carte. Quand
   * elle échoue, c'est presque toujours parce que le cache en garde un
   * refus du CDN plutôt que le fichier — la seule issue est de vider
   * l'entrée et de la redemander.
   */
  const { cle, reparer } = useReparationImage()

  // En mode animé le sprite est le visuel principal ; en mode illustration
  // il n'est chargé qu'au survol, en aperçu.
  const wantsAnimated = (animatedMode || hovered) && !reduced
  const showAnimated = wantsAnimated && animState === 'ready'

  // L'illustration n'est montée que si elle sert vraiment : la charger en
  // plus du sprite animé doublerait le trafic au lieu de l'alléger.
  const showArtwork = !animatedMode || reduced || animState === 'failed'

  return (
    // `min-h-0` : en tant qu'élément de grille, l'article aurait sinon un
    // `min-height: auto` qui le fait grandir avec son contenu et déborder
    // de la ligne virtualisée.
    <article className="h-full min-h-0 [perspective:1000px]">
      <div
        ref={tilt.ref}
        onPointerMove={tilt.onPointerMove}
        onPointerEnter={(event) => {
          // Le tactile n'a pas de survol : un appui ouvre la fiche, où
          // l'animation est disponible en grand.
          if (event.pointerType === 'touch' || reduced) return
          setHovered(true)
          setRequested(true)
        }}
        onPointerLeave={() => {
          setHovered(false)
          tilt.onPointerLeave()
        }}
        className="group relative flex h-full flex-col overflow-hidden rounded-card p-3 transition-[transform,box-shadow] duration-200 will-change-transform hover:shadow-xl"
        style={{
          ...typeStyleVars(pokemon.types),
          transform: 'rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg))',
          transformStyle: 'preserve-3d',
          background:
            'linear-gradient(155deg, color-mix(in oklab, var(--t1) 92%, black 4%) 0%, color-mix(in oklab, var(--t2) 78%, black 12%) 100%)',
          boxShadow: 'var(--card-glow)',
        }}
      >
        {/* Filigrane Pokéball, sous l'artwork */}
        <div
          aria-hidden="true"
          className="pokeball-watermark pointer-events-none absolute -right-10 -bottom-12 size-44 text-white opacity-[0.13] transition-transform duration-700 group-hover:rotate-90"
        />

        {/*
          L'artwork est sorti du flux et couvre toute la carte : sa
          taille ne dépend donc que des dimensions de la carte, jamais de
          l'en-tête ni du bloc du nom. Tant qu'il partageait la hauteur
          avec eux, un Pokémon à deux types s'affichait plus petit qu'un
          Pokémon à type unique.
          `contain` plutôt que `cover` : l'illustration est cadrée sur la
          largeur de la carte au lieu d'être zoomée sur sa hauteur, et
          rien n'est rogné. Le fond transparent des images laisse voir le
          dégradé du type autour du Pokémon.
        */}
        {showArtwork && (
          <img
            key={cle}
            src={artworkUrl(pokemon.id)}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => reparer(artworkUrl(pokemon.id), () => {})}
            className={`absolute inset-0 size-full object-contain object-center drop-shadow-[0_10px_14px_rgba(0,0,0,0.35)] transition-[transform,opacity] duration-300 group-hover:scale-105 ${
              showAnimated ? 'opacity-0' : 'opacity-100'
            }`}
          />
        )}

        {/* Sprite animé du jeu. L'illustration reste affichée tant qu'il
            n'est pas chargé, et reprend définitivement la main s'il
            n'existe pas — quelques Pokémon récents n'en ont pas. */}
        {(requested || wantsAnimated) && animState !== 'failed' && (
          <img
            src={showdownUrl(pokemon.id)}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            onLoad={() => setAnimState('ready')}
            onError={() => reparer(showdownUrl(pokemon.id), () => setAnimState('failed'))}
            className={`absolute inset-0 z-[1] size-full object-contain object-center p-[10%] pb-[24%] [image-rendering:pixelated] drop-shadow-[0_8px_10px_rgba(0,0,0,0.45)] transition-opacity duration-200 ${
              showAnimated ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}

        {/* Voile bas : garantit la lisibilité du nom quel que soit le
            Pokémon qui passe derrière. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2"
          style={{ background: 'linear-gradient(to top, rgb(0 0 0 / 0.5), transparent)' }}
        />

        {/* Reflet qui suit le curseur */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background:
              'radial-gradient(circle at var(--gx, 50%) var(--gy, 50%), color-mix(in oklab, white 38%, transparent), transparent 60%)',
          }}
        />

        <div className="relative z-10 flex items-start justify-between">
          {/* Le cœur ne marque que les Pokémon déjà en favori : sur 1025
              cartes, un cœur vide partout ne serait que du bruit. On
              ajoute ou retire depuis la fiche. */}
          {favorite && (
            <button
              type="button"
              onClick={() => toggle(pokemon.id)}
              aria-pressed
              aria-label={`Retirer ${pokemon.name} des favoris`}
              className="z-30 grid size-8 place-items-center rounded-full bg-white/90 text-rose-500 backdrop-blur-sm transition hover:bg-white"
            >
              <HeartIcon className="size-4" filled />
            </button>
          )}

          {/* Le numéro se détache maintenant sur l'illustration et non
              plus sur un aplat : il lui faut une ombre portée. */}
          <span
            className="ml-auto font-black text-white/45 text-xl tabular-nums"
            style={{ textShadow: '0 1px 6px rgb(0 0 0 / 0.45)' }}
          >
            {formatDexNumber(pokemon.id)}
          </span>
        </div>

        {/* Pousse le bloc du nom en bas de la carte. */}
        <div aria-hidden="true" className="min-h-0 flex-1" />

        <div className="relative z-10 rounded-2xl bg-black/30 px-2.5 py-2 backdrop-blur-[2px]">
          <p className="truncate font-bold text-[15px] text-white leading-tight">{pokemon.name}</p>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {pokemon.types.map((type) => (
              <TypeBadge key={type} type={type} size="xs" onColor />
            ))}
          </div>
        </div>

        <Link
          to={to}
          className="absolute inset-0 z-20 rounded-card"
          aria-label={`Voir la fiche de ${pokemon.name}`}
        />
      </div>
    </article>
  )
}

// 1025 entrées filtrées à chaque frappe : sans memo, toutes les cartes
// visibles se re-rendraient à chaque caractère tapé.
export const PokemonCard = memo(PokemonCardBase)
