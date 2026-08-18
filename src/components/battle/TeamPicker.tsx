import { useDeferredValue, useMemo, useRef, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Link } from 'react-router'
import type { BattleForm, PokemonSummary } from '@/api/models'
import { FormSheet } from '@/components/battle/FormSheet'
import { ActiveFilterChips } from '@/components/filters/ActiveFilterChips'
import { FilterDrawer } from '@/components/filters/FilterDrawer'
import { FilterPanel } from '@/components/filters/FilterPanel'
import { ResultsBar } from '@/components/filters/ResultsBar'
import { FallbackImage } from '@/components/ui/FallbackImage'
import { TypeBadge } from '@/components/ui/TypeBadge'
import {
  ArrowLeftIcon,
  CloseIcon,
  PencilIcon,
  SearchIcon,
  SparklesIcon,
} from '@/components/ui/icons'
import { useFavorites } from '@/hooks/use-favorites'
import { useLocalFilters } from '@/hooks/use-filters'
import { useNomsJoueurs } from '@/hooks/use-noms-joueurs'
import { NOM_MAX, NOMS_PAR_DEFAUT } from '@/lib/battle/noms'
import { TAILLE_EQUIPE } from '@/lib/battle/types'
import type { Choix } from '@/lib/battle/types'
import { applyFilters, computeBounds } from '@/lib/filters'
import { formatDexNumber } from '@/lib/format'
import { typeGradient } from '@/lib/pokemon-types'
import { vignetteSources } from '@/lib/sprites'

const HAUTEUR_LIGNE = 68

type Props = {
  pokemon: PokemonSummary[]
  player: 1 | 2
  /** Formes jouables par espèce, `undefined` tant que la table n'est pas là. */
  formes: ReadonlyMap<number, BattleForm[]> | undefined
  onDone: (choix: Choix[]) => void
}

export function TeamPicker({ pokemon, player, formes, onDone }: Props) {
  const controleur = useLocalFilters()
  const { saisis, definirNom } = useNomsJoueurs()
  const side = (player - 1) as 0 | 1
  const { favorites } = useFavorites()
  const [choisis, setChoisis] = useState<Choix[]>([])
  const [tiroirOuvert, setTiroirOuvert] = useState(false)
  /** Index de l'emplacement dont la feuille de forme est ouverte. */
  const [feuille, setFeuille] = useState<number | null>(null)
  const listeRef = useRef<HTMLDivElement>(null)

  // Même traitement que la grille : la recherche traverse 1025 entrées,
  // la valeur différée garde la frappe fluide.
  const requeteDifferee = useDeferredValue(controleur.filters.query)
  const filtresEffectifs = useMemo(
    () => ({ ...controleur.filters, query: requeteDifferee }),
    [controleur.filters, requeteDifferee],
  )

  const resultats = useMemo(
    () => applyFilters(pokemon, filtresEffectifs, favorites).results,
    [pokemon, filtresEffectifs, favorites],
  )

  const bounds = useMemo(() => computeBounds(pokemon), [pokemon])

  const virtualizer = useVirtualizer({
    count: resultats.length,
    getScrollElement: () => listeRef.current,
    estimateSize: () => HAUTEUR_LIGNE,
    overscan: 8,
  })

  /*
   * Une espèce ne peut occuper qu'un emplacement : deux entrées identiques
   * dans une équipe rendraient le journal de combat ambigu, et le choix de
   * forme se ferait sur un emplacement qu'on ne saurait plus désigner.
   */
  const basculer = (speciesId: number) => {
    setChoisis((actuels) =>
      actuels.some((choix) => choix.speciesId === speciesId)
        ? actuels.filter((choix) => choix.speciesId !== speciesId)
        : actuels.length < TAILLE_EQUIPE
          ? [...actuels, { speciesId, formId: null, shiny: false }]
          : actuels,
    )
  }

  const modifier = (index: number, choix: Choix) =>
    setChoisis((actuels) => actuels.map((actuel, i) => (i === index ? choix : actuel)))

  const retirer = (index: number) => {
    setChoisis((actuels) => actuels.filter((_, i) => i !== index))
    setFeuille(null)
  }

  const parId = useMemo(() => new Map(pokemon.map((p) => [p.id, p])), [pokemon])
  const complet = choisis.length === TAILLE_EQUIPE

  const retenus = useMemo(
    () => new Set(choisis.map((choix) => choix.speciesId)),
    [choisis],
  )

  /** L'apparence d'un emplacement : nom, sprite et badge dépendent de la forme. */
  const apercu = (choix: Choix) => {
    const espece = parId.get(choix.speciesId)
    const disponibles = formes?.get(choix.speciesId) ?? []
    const forme = choix.formId
      ? disponibles.find((candidate) => candidate.id === choix.formId)
      : undefined

    return {
      espece,
      forme,
      disponibles,
      name: forme?.name ?? espece?.name ?? '',
      types: forme?.types ?? espece?.types ?? [],
      spriteId: forme?.id ?? choix.speciesId,
    }
  }

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
          <div className="flex items-center justify-between gap-3">
            {/*
              Le retour ramène au Pokédex, jamais à l'écran précédent : depuis
              la sélection du joueur 2, revenir en arrière afficherait
              l'équipe que le joueur 1 vient de composer.
            */}
            <Link
              to="/"
              className="flex items-center gap-1.5 font-semibold text-ink-soft text-sm transition hover:text-ink"
            >
              <ArrowLeftIcon className="size-4" />
              Pokédex
            </Link>

            {/*
              Le titre est le champ. Un écran de réglages ferait payer à
              chaque partie un choix qu'on ne fait qu'une fois ; ici chacun
              se nomme en composant son équipe, sans étape ajoutée. Le crayon
              est là pour que ça se voie : un champ sans bordure ressemble
              sinon à du texte mort.
            */}
            <label className="group flex items-center gap-1.5 rounded-lg px-2 py-1 transition focus-within:bg-panel-soft hover:bg-panel-soft">
              <input
                value={saisis[side]}
                onChange={(event) => definirNom(side, event.target.value)}
                placeholder={NOMS_PAR_DEFAUT[side]}
                maxLength={NOM_MAX}
                aria-label={`Nom du joueur ${player}`}
                enterKeyHint="done"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur()
                }}
                className="w-28 bg-transparent text-right font-black text-ink text-lg tracking-tight outline-none placeholder:text-ink-faint sm:w-36"
              />
              {/* Après le champ, pas avant : le texte est aligné à droite, un
                  crayon posé à gauche flotterait loin du nom. */}
              <PencilIcon className="size-3.5 shrink-0 text-ink-faint transition group-focus-within:text-accent" />
            </label>
          </div>

          {/* Les emplacements restent visibles en permanence : c'est le
              retour qui dit ce qui a été choisi sans quitter la liste. */}
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: TAILLE_EQUIPE }, (_, index) => {
              const choix = choisis[index]

              // La clé est la position, jamais l'identifiant du Pokémon :
              // Bulbizarre (n° 1) entrerait sinon en collision avec la clé
              // de l'emplacement vide d'index 1.
              if (!choix) {
                return (
                  <div
                    key={index}
                    className="grid h-20 place-items-center rounded-2xl border border-line border-dashed px-1 text-center text-ink-faint text-xs"
                  >
                    Emplacement {index + 1}
                  </div>
                )
              }

              const vue = apercu(choix)

              /*
               * En colonne, et non en ligne comme les cartes de la liste :
               * à 375 px un emplacement fait 108 px de large, dont un sprite
               * et une croix ne laissaient que vingt pixels au nom. Empilé,
               * le nom dispose de toute la largeur — ce qui devient
               * nécessaire avec des libellés comme « Ossatueur d'Alola ».
               *
               * Deux boutons distincts, et non une croix dans le bouton :
               * imbriquer des boutons est invalide, et le corps de
               * l'emplacement a désormais son propre rôle — ouvrir la
               * feuille de forme — distinct du retrait.
               */
              return (
                <div
                  key={index}
                  className="relative h-20 overflow-hidden rounded-2xl border border-line"
                  style={{ backgroundImage: typeGradient(vue.types, 24) }}
                >
                  <button
                    type="button"
                    onClick={() => setFeuille(index)}
                    title={`Forme et couleur : ${vue.name}`}
                    className="flex size-full flex-col items-center justify-center gap-0.5 px-1.5"
                  >
                    <FallbackImage
                      sources={vignetteSources(vue.spriteId, choix.shiny)}
                      className="size-9 shrink-0 object-contain"
                    />

                    <span className="flex w-full items-center justify-center gap-0.5">
                      <span className="min-w-0 truncate font-bold text-[11px] text-ink">
                        {vue.name}
                      </span>
                      {choix.shiny && <SparklesIcon className="size-3 shrink-0 text-amber-400" />}
                    </span>

                    {/* Sans forme retenue, l'étiquette signale simplement
                        qu'il y en a à voir : la feuille se découvre en
                        tapant l'emplacement, rien d'autre ne le dit. */}
                    {vue.forme ? (
                      <span className="max-w-full truncate rounded-full bg-ink/10 px-1.5 font-semibold text-[10px] text-ink-soft">
                        {vue.forme.shortName}
                      </span>
                    ) : (
                      vue.disponibles.length > 0 && (
                        <span className="rounded-full border border-line px-1.5 font-semibold text-[10px] text-ink-faint">
                          Formes
                        </span>
                      )
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => retirer(index)}
                    aria-label={`Retirer ${vue.name}`}
                    className="absolute top-0.5 right-0.5 grid size-6 place-items-center rounded-full text-ink-faint transition hover:bg-ink/10 hover:text-ink"
                  >
                    <CloseIcon className="size-3.5" />
                  </button>
                </div>
              )
            })}
          </div>

          <div className="relative">
            <SearchIcon className="-translate-y-1/2 absolute top-1/2 left-3 size-4 text-ink-faint" />
            <input
              type="search"
              value={controleur.filters.query}
              onChange={(event) => controleur.setQuery(event.target.value)}
              placeholder="Chercher un Pokémon…"
              className="w-full rounded-full border border-line bg-panel-soft py-2.5 pr-4 pl-9 text-ink text-sm outline-none placeholder:text-ink-faint focus:border-accent"
            />
          </div>

          <ResultsBar
            controller={controleur}
            count={resultats.length}
            total={pokemon.length}
            onOpenFilters={() => setTiroirOuvert(true)}
            filtresToujoursVisibles
          />
        </div>
      </header>

      <div ref={listeRef} className="min-h-0 flex-1 overflow-y-auto px-4 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <ActiveFilterChips controller={controleur} bounds={bounds} />

          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((ligne) => {
              const entry = resultats[ligne.index]
              const actif = retenus.has(entry.id)
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
                    <FallbackImage
                      sources={vignetteSources(entry.id)}
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
            <div className="space-y-3 py-16 text-center">
              <p className="text-ink-faint">Aucun Pokémon ne correspond.</p>
              <button
                type="button"
                onClick={controleur.reset}
                className="rounded-full border border-line bg-panel-soft px-4 py-2 font-semibold text-ink-soft text-sm transition hover:text-ink"
              >
                Effacer les filtres
              </button>
            </div>
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

      <FilterDrawer open={tiroirOuvert} onClose={() => setTiroirOuvert(false)} toutesTailles>
        <FilterPanel controller={controleur} bounds={bounds} pokemon={pokemon} />
      </FilterDrawer>

      <AnimatePresence>
        {feuille !== null &&
          choisis[feuille] &&
          (() => {
            const choix = choisis[feuille]
            const vue = apercu(choix)
            if (!vue.espece) return null

            return (
              <FormSheet
                key={feuille}
                espece={vue.espece}
                formes={vue.disponibles}
                choix={choix}
                onChange={(suivant) => modifier(feuille, suivant)}
                onRetirer={() => retirer(feuille)}
                onClose={() => setFeuille(null)}
              />
            )
          })()}
      </AnimatePresence>
    </div>
  )
}
