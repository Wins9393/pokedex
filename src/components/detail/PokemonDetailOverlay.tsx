import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import type { PokemonSummary } from '@/api/models'
import { TypeBadge } from '@/components/ui/TypeBadge'
import { ArrowLeftIcon, HeartIcon } from '@/components/ui/icons'
import { useFavorites } from '@/hooks/use-favorites'
import { usePokemonDetail } from '@/hooks/use-pokedex'
import { useScrollLock } from '@/hooks/use-scroll-lock'
import { formatDexNumber } from '@/lib/format'
import { typeGradient } from '@/lib/pokemon-types'
import type { TypeChart } from '@/lib/type-chart'
import { ArtworkStage } from './ArtworkStage'
import { EvolutionChain } from './EvolutionChain'
import { AbilityList, FormSelector, InfoGrid, PokedexEntries } from './DetailSections'
import { StatBars } from './StatBars'
import { StatRadar } from './StatRadar'
import { WeaknessGrid } from './WeaknessGrid'

const MIN_ID = 1
const MAX_ID = 1025

type Props = {
  id: number
  chart: TypeChart
  /** Données déjà connues par l'index : la fiche s'affiche avant la requête. */
  summary?: PokemonSummary
  onClose: () => void
  onNavigate: (id: number) => void
}

function Panel({
  title,
  className = '',
  children,
}: {
  title: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <section className={`rounded-2xl border border-line bg-panel p-4 ${className}`}>
      <h3 className="mb-3 font-bold text-[11px] text-ink-faint uppercase tracking-[0.12em]">
        {title}
      </h3>
      {children}
    </section>
  )
}

export function PokemonDetailOverlay({ id, chart, summary, onClose, onNavigate }: Props) {
  const { data: detail, isPending, isError } = usePokemonDetail(id)
  const { isFavorite, toggle } = useFavorites()
  const reduced = useReducedMotion()

  const [formId, setFormId] = useState<number | null>(null)
  const [shiny, setShiny] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const activeForm = useMemo(() => {
    if (!detail) return null
    return detail.forms.find((form) => form.id === formId) ?? detail.forms[0] ?? null
  }, [detail, formId])

  // Types affichés : ceux de la forme courante si elle est chargée,
  // sinon ceux de l'index pour éviter un en-tête gris au premier rendu.
  const types = activeForm?.types ?? summary?.types ?? []
  const name = detail?.name ?? summary?.name ?? ''
  const favorite = isFavorite(id)

  useScrollLock(true)

  useEffect(() => {
    panelRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft' && id > MIN_ID) onNavigate(id - 1)
      if (event.key === 'ArrowRight' && id < MAX_ID) onNavigate(id + 1)
    }
    window.addEventListener('keydown', onKeyDown)

    return () => window.removeEventListener('keydown', onKeyDown)
  }, [id, onClose, onNavigate])

  return (
    <div className="stable-gutter fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-0 sm:p-4 md:p-6">
      <motion.div
        className="fixed inset-0 bg-black/65 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />

      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={name ? `Fiche de ${name}` : 'Fiche Pokémon'}
        tabIndex={-1}
        className="relative z-10 w-full max-w-5xl overflow-hidden bg-canvas shadow-2xl outline-none sm:rounded-card"
        initial={reduced ? false : { opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduced ? undefined : { opacity: 0, y: 16, scale: 0.98 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      >
        {/* En-tête coloré */}
        <div
          className="relative px-4 pt-4 pb-6 sm:px-6"
          style={{ background: typeGradient(types, 88) }}
        >
          {/* Voile assombrissant : sans lui, le texte blanc devient
              illisible sur les types clairs (Électrik, Glace, Acier). */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background: 'linear-gradient(180deg, rgb(0 0 0 / 0.14) 0%, rgb(0 0 0 / 0.45) 100%)',
            }}
          />
          <div
            aria-hidden="true"
            className="pokeball-watermark pointer-events-none absolute -top-16 -right-16 size-64 text-white opacity-10"
          />

          <div className="relative flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 rounded-full bg-black/25 px-3 py-2 font-semibold text-white text-xs backdrop-blur-sm transition hover:bg-black/40"
            >
              <ArrowLeftIcon className="size-4" />
              Retour
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => toggle(id)}
                aria-pressed={favorite}
                aria-label={favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
                className={`grid size-9 place-items-center rounded-full backdrop-blur-sm transition ${
                  favorite ? 'bg-white text-rose-500' : 'bg-black/25 text-white hover:bg-black/40'
                }`}
              >
                <HeartIcon className="size-4.5" filled={favorite} />
              </button>
            </div>
          </div>

          <div className="relative mt-2 grid items-center gap-4 md:grid-cols-[1fr_370px]">
            <div className="order-2 md:order-1">
              <p className="font-black text-4xl text-white/45 tabular-nums">
                {formatDexNumber(id)}
              </p>
              <h2
                className="font-black text-4xl text-white leading-tight sm:text-5xl"
                style={{ textShadow: '0 2px 12px rgb(0 0 0 / 0.35)' }}
              >
                {activeForm && !activeForm.isDefault ? activeForm.name : name}
              </h2>
              {detail?.genus && <p className="mt-1 text-white/90">{detail.genus}</p>}

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {types.map((type) => (
                  <TypeBadge key={type} type={type} size="md" onColor />
                ))}
                {detail?.isLegendary && (
                  <span className="rounded-full bg-amber-400/90 px-3 py-1.5 font-semibold text-amber-950 text-xs">
                    Légendaire
                  </span>
                )}
                {detail?.isMythical && (
                  <span className="rounded-full bg-fuchsia-400/90 px-3 py-1.5 font-semibold text-fuchsia-950 text-xs">
                    Fabuleux
                  </span>
                )}
                {detail?.isBaby && (
                  <span className="rounded-full bg-sky-300/90 px-3 py-1.5 font-semibold text-sky-950 text-xs">
                    Bébé
                  </span>
                )}
              </div>

              {detail && (
                <div className="mt-3">
                  <FormSelector
                    forms={detail.forms}
                    activeId={activeForm?.id ?? 0}
                    onSelect={(nextId) => {
                      setFormId(nextId)
                      setShiny(false)
                    }}
                  />
                </div>
              )}
            </div>

            <div className="order-1 md:order-2">
              {activeForm ? (
                <ArtworkStage
                  form={activeForm}
                  shiny={shiny}
                  onToggleShiny={() => setShiny((value) => !value)}
                />
              ) : (
                <div className="mx-auto flex aspect-square w-full max-w-[270px] items-center justify-center sm:max-w-[350px]">
                  <div className="size-[70%] animate-pulse rounded-full bg-white/20" />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Corps */}
        <div className="space-y-4 p-4 sm:p-6">
          {isError && (
            <p className="rounded-xl bg-panel p-4 text-ink-soft text-sm">
              Impossible de charger le détail de ce Pokémon.
            </p>
          )}

          {isPending && (
            <div className="grid gap-4 lg:grid-cols-2">
              {[0, 1, 2, 3].map((index) => (
                <div key={index} className="h-48 animate-pulse rounded-2xl bg-panel" />
              ))}
            </div>
          )}

          {detail && activeForm && (
            <>
              {/*
                Deux colonnes sur grand écran, une seule en dessous. Les
                conteneurs de colonne passent en `display: contents` sur
                mobile : les panneaux deviennent alors enfants directs de
                la pile et peuvent être réordonnés avec `order`, sans
                dupliquer le balisage. Ordre mobile voulu : stats,
                faiblesses, identité, talents, description, évolutions.
              */}
              <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start">
                <div className="contents lg:flex lg:flex-col lg:gap-4">
                  <Panel title="Description" className="order-5 lg:order-none">
                    <PokedexEntries entries={detail.entries} />
                  </Panel>
                  <Panel title="Talents" className="order-4 lg:order-none">
                    <AbilityList abilities={activeForm.abilities} />
                  </Panel>
                  <Panel title="Fiche d'identité" className="order-3 lg:order-none">
                    <InfoGrid detail={detail} form={activeForm} />
                  </Panel>
                </div>

                <div className="contents lg:flex lg:flex-col lg:gap-4">
                  <Panel title="Statistiques de base" className="order-1 lg:order-none">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                      <div className="w-full min-w-0 flex-1">
                        <StatBars stats={activeForm.stats} total={activeForm.statTotal} />
                      </div>
                      <div className="flex w-full shrink-0 justify-center sm:w-[260px]">
                        <StatRadar stats={activeForm.stats} types={activeForm.types} />
                      </div>
                    </div>
                  </Panel>

                  <Panel title="Faiblesses et résistances" className="order-2 lg:order-none">
                    <WeaknessGrid chart={chart} types={activeForm.types} />
                  </Panel>
                </div>
              </div>

              <Panel title="Évolutions">
                <EvolutionChain
                  nodes={detail.evolution}
                  currentId={detail.id}
                  onNavigate={onNavigate}
                />
              </Panel>
            </>
          )}

          {/* Navigation entre espèces */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              type="button"
              disabled={id <= MIN_ID}
              onClick={() => onNavigate(id - 1)}
              className="flex items-center gap-1.5 rounded-full border border-line bg-panel px-4 py-2 font-semibold text-ink-soft text-sm transition hover:text-ink disabled:opacity-40"
            >
              <ArrowLeftIcon className="size-4" />
              Précédent
            </button>
            {/* Raccourcis clavier : sans objet sur mobile, où ils ne font
                que comprimer les deux boutons. */}
            <span className="hidden text-ink-faint text-xs sm:block">
              ← → pour naviguer · Échap pour fermer
            </span>
            <button
              type="button"
              disabled={id >= MAX_ID}
              onClick={() => onNavigate(id + 1)}
              className="flex items-center gap-1.5 rounded-full border border-line bg-panel px-4 py-2 font-semibold text-ink-soft text-sm transition hover:text-ink disabled:opacity-40"
            >
              Suivant
              <ArrowLeftIcon className="size-4 rotate-180" />
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
