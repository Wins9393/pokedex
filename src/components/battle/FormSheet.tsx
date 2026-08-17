import { useEffect } from 'react'
import { motion } from 'motion/react'
import type { BattleForm, PokemonSummary } from '@/api/models'
import { FallbackImage } from '@/components/ui/FallbackImage'
import { TypeBadge } from '@/components/ui/TypeBadge'
import { CloseIcon, SparklesIcon } from '@/components/ui/icons'
import { useScrollLock } from '@/hooks/use-scroll-lock'
import type { Choix } from '@/lib/battle/types'
import { STAT_ORDER, STAT_SHORT_FR, typeGradient } from '@/lib/pokemon-types'
import type { StatName, TypeName } from '@/lib/pokemon-types'
import { vignetteSources } from '@/lib/sprites'

type Props = {
  espece: PokemonSummary
  /** Formes alternatives jouables de cette espèce, éventuellement vide. */
  formes: BattleForm[]
  choix: Choix
  onChange: (choix: Choix) => void
  onRetirer: () => void
  onClose: () => void
}

type Entree = {
  id: number | null
  name: string
  types: TypeName[]
  stats: Record<StatName, number>
  statTotal: number
  /** Identifiant du sprite : celui de la forme, ou celui de l'espèce. */
  spriteId: number
}

/**
 * Les deux statistiques les plus fortes, en abrégé.
 *
 * Le total seul ne suffit pas : les quatre formes de Deoxys pèsent 600
 * chacune et ne diffèrent que par la répartition — sans ce repère, la
 * feuille afficherait quatre lignes identiques pour quatre Pokémon qui se
 * jouent de façons opposées.
 */
const pointsForts = (stats: Record<StatName, number>) =>
  STAT_ORDER.map((clef) => ({ clef, valeur: stats[clef] }))
    .sort((a, b) => b.valeur - a.valeur)
    .slice(0, 2)

function Ligne({
  entree,
  actif,
  shiny,
  onChoisir,
}: {
  entree: Entree
  actif: boolean
  shiny: boolean
  onChoisir: () => void
}) {
  return (
    <button
      type="button"
      onClick={onChoisir}
      aria-pressed={actif}
      className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left transition ${
        actif ? 'border-accent' : 'border-line hover:border-ink-faint'
      }`}
      style={{ backgroundImage: typeGradient(entree.types, actif ? 24 : 14) }}
    >
      <FallbackImage
        sources={vignetteSources(entree.spriteId, shiny)}
        className="size-12 shrink-0 object-contain"
      />

      <div className="min-w-0 flex-1">
        <p className="truncate font-bold text-ink text-sm">{entree.name}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {entree.types.map((type) => (
            <TypeBadge key={type} type={type} size="xs" />
          ))}
          <span className="text-[10px] text-ink-faint tabular-nums">
            {pointsForts(entree.stats)
              .map(({ clef, valeur }) => `${STAT_SHORT_FR[clef]} ${valeur}`)
              .join(' · ')}
          </span>
        </div>
      </div>

      <span className="shrink-0 text-right">
        <span className="block font-bold text-ink text-sm tabular-nums">{entree.statTotal}</span>
        <span className="block text-[10px] text-ink-faint uppercase">total</span>
      </span>
    </button>
  )
}

/**
 * Choix de la forme et de la couleur, ouvert depuis un emplacement d'équipe
 * déjà rempli.
 *
 * Il n'a délibérément pas sa place dans la liste de sélection : y verser les
 * 219 formes ferait défiler trois Dracaufeu à la suite, pour un choix qui
 * ne concerne que 179 des 1025 espèces. Ici, il n'apparaît qu'une fois le
 * Pokémon retenu, et il est le seul endroit qui parle de son apparence.
 */
export function FormSheet({ espece, formes, choix, onChange, onRetirer, onClose }: Props) {
  useScrollLock(true)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const entrees: Entree[] = [
    {
      id: null,
      name: espece.name,
      types: espece.types,
      stats: espece.stats,
      statTotal: espece.statTotal,
      spriteId: espece.id,
    },
    ...formes.map((forme) => ({
      id: forme.id,
      name: forme.name,
      types: forme.types,
      stats: forme.stats,
      statTotal: forme.statTotal,
      spriteId: forme.id,
    })),
  ]

  const apercu = entrees.find((entree) => entree.id === choix.formId) ?? entrees[0]

  return (
    <>
      <motion.div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />

      {/* Deux-points plutôt qu'un « de » dans le libellé : « de Ossatueur »
          impose une élision qu'aucun nom du dex ne rend fiable. */}
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={`Forme et couleur : ${espece.name}`}
        className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-3xl border-line border-t bg-canvas px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:mx-auto sm:max-w-lg sm:rounded-3xl sm:border"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 320 }}
      >
        <div className="flex items-center justify-between gap-3 pb-3">
          <h2 className="min-w-0 truncate font-black text-ink text-lg tracking-tight">
            {apercu.name}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-panel-soft text-ink-soft transition hover:text-ink"
          >
            <CloseIcon className="size-4.5" />
          </button>
        </div>

        {/*
          Le chromatique est proposé pour tout le monde : là où le sprite
          normal existe, le chromatique existe aussi — vérifié sur les 1025
          espèces comme sur les formes, sans une exception.
        */}
        <button
          type="button"
          onClick={() => onChange({ ...choix, shiny: !choix.shiny })}
          aria-pressed={choix.shiny}
          className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 font-semibold text-sm transition ${
            choix.shiny
              ? 'border-amber-400 bg-amber-400/10 text-ink'
              : 'border-line bg-panel-soft text-ink-soft hover:text-ink'
          }`}
        >
          <span className="flex items-center gap-2">
            <SparklesIcon
              className={`size-4 ${choix.shiny ? 'text-amber-400' : 'text-ink-faint'}`}
            />
            Chromatique
          </span>
          <span className="text-ink-faint text-xs">{choix.shiny ? 'Activé' : 'Désactivé'}</span>
        </button>

        {formes.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="font-semibold text-ink-faint text-xs uppercase tracking-wide">
              Forme ({entrees.length})
            </p>
            {entrees.map((entree) => (
              <Ligne
                key={entree.id ?? 'defaut'}
                entree={entree}
                actif={entree.id === choix.formId}
                shiny={choix.shiny}
                onChoisir={() => onChange({ ...choix, formId: entree.id })}
              />
            ))}
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onRetirer}
            className="flex-1 rounded-full border border-line bg-panel-soft py-2.5 font-semibold text-ink-soft text-sm transition hover:text-ink"
          >
            Retirer de l’équipe
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full bg-accent py-2.5 font-bold text-sm text-white"
          >
            Terminé
          </button>
        </div>
      </motion.div>
    </>
  )
}
