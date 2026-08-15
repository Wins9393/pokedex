import { useEffect, useMemo, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import type { PokemonForm } from '@/api/models'
import { SparklesIcon, VolumeIcon } from '@/components/ui/icons'
import { useCry } from '@/hooks/use-cry'
import { useSpriteMode } from '@/hooks/use-sprite-mode'
import { typeColor } from '@/lib/pokemon-types'
import { animatedImage, bestImage, hasAnimated, hasShiny } from '@/lib/sprites'

type Props = {
  form: PokemonForm
  shiny: boolean
  onToggleShiny: () => void
}

/** Positions figées : régénérer à chaque rendu ferait sauter les étincelles. */
const SPARKLES = [
  { top: '8%', left: '18%', delay: 0 },
  { top: '22%', left: '78%', delay: 0.12 },
  { top: '58%', left: '8%', delay: 0.24 },
  { top: '70%', left: '84%', delay: 0.08 },
  { top: '38%', left: '46%', delay: 0.3 },
  { top: '84%', left: '38%', delay: 0.18 },
]

export function ArtworkStage({ form, shiny, onToggleShiny }: Props) {
  const reduced = useReducedMotion()
  const { play, isPlaying } = useCry()
  const { animated: animatedByDefault } = useSpriteMode()
  const [burst, setBurst] = useState(0)
  const [wantsAnimated, setWantsAnimated] = useState(animatedByDefault)

  const shinyAvailable = hasShiny(form.sprites)
  const animatedAvailable = hasAnimated(form.sprites)

  // Une forme sans sprite animé retombe d'elle-même sur l'illustration,
  // sans qu'on ait à réinitialiser l'état au changement de forme.
  const animated = wantsAnimated && animatedAvailable
  const image = animated ? animatedImage(form.sprites, shiny) : bestImage(form.sprites, shiny)
  const halo = typeColor(form.types[0] ?? 'normal')

  // Rejoue l'éclat à chaque passage en chromatique.
  useEffect(() => {
    if (shiny) setBurst((value) => value + 1)
  }, [shiny])

  const sparkles = useMemo(
    () =>
      shiny && !reduced
        ? SPARKLES.map((sparkle, index) => (
            <span
              key={`${burst}-${index}`}
              aria-hidden="true"
              className="pointer-events-none absolute animate-sparkle"
              style={{
                top: sparkle.top,
                left: sparkle.left,
                animationDelay: `${sparkle.delay}s`,
              }}
            >
              <SparklesIcon className="size-5 text-amber-200" />
            </span>
          ))
        : null,
    [shiny, reduced, burst],
  )

  return (
    <div className="relative flex flex-col items-center">
      <div className="relative flex aspect-square w-full max-w-[270px] items-center justify-center sm:max-w-[350px]">
        <div
          aria-hidden="true"
          className="absolute size-[78%] rounded-full blur-2xl"
          style={{ background: `color-mix(in oklab, ${halo} 55%, transparent)` }}
        />
        <div
          aria-hidden="true"
          className="pokeball-watermark absolute size-[92%] text-white opacity-10"
        />

        {/* Ombre au sol : donne au sprite animé l'air de se tenir debout
            plutôt que de flotter dans le vide. */}
        {animated && (
          <div
            aria-hidden="true"
            className="absolute bottom-[14%] h-3 w-[42%] rounded-[50%] bg-black/30 blur-[6px]"
          />
        )}

        {image ? (
          <img
            key={image}
            src={image}
            alt={`${form.name}${shiny ? ' chromatique' : ''}`}
            className={
              animated
                ? // Rendu pixelisé, sinon l'agrandissement rend le sprite
                  // flou. La taille est bornée plutôt que fixée : les
                  // sprites vont de 35 à 148 px de large, et les forcer à
                  // une largeur unique transformerait les plus petits en
                  // gros pavés tout en effaçant les écarts de gabarit
                  // entre Pokémon.
                  'relative mb-[6%] h-auto w-auto min-w-[62%] max-w-[92%] [image-rendering:pixelated] drop-shadow-[0_10px_10px_rgba(0,0,0,0.35)]'
                : `relative w-[94%] object-contain drop-shadow-[0_18px_24px_rgba(0,0,0,0.45)] ${
                    reduced ? '' : 'animate-float'
                  }`
            }
          />
        ) : (
          <span className="text-ink-faint text-sm">Illustration indisponible</span>
        )}

        {sparkles}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        {/* Illustration officielle ou sprite animé du jeu */}
        <div className="flex rounded-full bg-black/25 p-0.5 backdrop-blur-sm">
          {(
            [
              { value: false, label: 'Illustration' },
              { value: true, label: 'Animé' },
            ] as const
          ).map((option) => (
            <button
              key={String(option.value)}
              type="button"
              onClick={() => setWantsAnimated(option.value)}
              disabled={option.value && !animatedAvailable}
              aria-pressed={animated === option.value}
              title={
                option.value && !animatedAvailable
                  ? 'Pas de sprite animé pour cette forme'
                  : undefined
              }
              className={`rounded-full px-3 py-1.5 font-semibold text-xs transition disabled:cursor-not-allowed disabled:opacity-40 ${
                animated === option.value
                  ? 'bg-white text-slate-900'
                  : 'text-white/80 hover:text-white'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onToggleShiny}
          disabled={!shinyAvailable}
          aria-pressed={shiny}
          className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 font-semibold text-xs transition disabled:cursor-not-allowed disabled:opacity-40 ${
            shiny
              ? 'bg-amber-400 text-amber-950 shadow-[0_6px_18px_-6px_rgb(251_191_36)]'
              : 'bg-white/15 text-white hover:bg-white/25'
          }`}
          title={shinyAvailable ? 'Basculer en chromatique' : 'Pas de forme chromatique connue'}
        >
          <SparklesIcon className="size-4" />
          {shiny ? 'Chromatique' : 'Normal'}
        </button>

        <button
          type="button"
          onClick={() => play(form.cry)}
          disabled={!form.cry}
          aria-label={`Écouter le cri de ${form.name}`}
          className={`grid size-9 place-items-center rounded-full text-white transition disabled:opacity-40 ${
            isPlaying ? 'bg-white/35' : 'bg-white/15 hover:bg-white/25'
          }`}
        >
          <VolumeIcon className="size-4.5" />
        </button>
      </div>
    </div>
  )
}
