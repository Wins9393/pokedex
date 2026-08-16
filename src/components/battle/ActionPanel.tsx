import { useState } from 'react'
import { TypeBadge } from '@/components/ui/TypeBadge'
import { ArrowLeftIcon, SwapIcon } from '@/components/ui/icons'
import { efficaciteContre } from '@/lib/battle/damage'
import type { Action, Battler } from '@/lib/battle/types'
import { typeColor, typeGradient } from '@/lib/pokemon-types'
import { formatMultiplier } from '@/lib/type-chart'
import type { TypeChart } from '@/lib/type-chart'
import { artworkUrl } from '@/lib/sprites'

type Remplacant = { battler: Battler; index: number }

type Props = {
  battler: Battler
  /** Le Pokémon en face, pour annoncer l'efficacité de chaque attaque. */
  adversaire: Battler
  chart: TypeChart | undefined
  remplacants: Remplacant[]
  onAction: (action: Action) => void
}

/*
 * Sémantique **offensive**, à ne pas confondre avec celle de la grille de
 * faiblesses : là-bas un ×4 est une mauvaise nouvelle puisqu'on le subit,
 * ici c'est la meilleure. Les couleurs sont donc inversées.
 */
type Efficacite = 'super' | 'neutre' | 'faible' | 'nul'

const EFFICACITE: Record<Efficacite, { style: string; libelle: string }> = {
  super: { style: 'bg-emerald-500/15 text-emerald-500', libelle: 'Super efficace' },
  neutre: { style: 'bg-ink-faint/10 text-ink-faint', libelle: 'Efficacité normale' },
  faible: { style: 'bg-orange-500/15 text-orange-500', libelle: 'Pas très efficace' },
  nul: { style: 'bg-ink-faint/15 text-ink-faint line-through', libelle: 'Sans effet' },
}

const efficaciteDe = (multiplicateur: number): Efficacite => {
  if (multiplicateur === 0) return 'nul'
  if (multiplicateur > 1) return 'super'
  if (multiplicateur < 1) return 'faible'
  return 'neutre'
}

/**
 * Partagé entre le changement volontaire et l'envoi d'un remplaçant après
 * un K.O. : ce sont deux moments distincts du jeu, mais le même geste.
 */
export function ListeRemplacants({
  remplacants,
  onChoisir,
}: {
  remplacants: Remplacant[]
  onChoisir: (index: number) => void
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {remplacants.map(({ battler, index }) => (
        <button
          key={index}
          type="button"
          onClick={() => onChoisir(index)}
          className="flex items-center gap-2 rounded-2xl border border-line px-3 py-2 text-left transition hover:border-ink-faint"
          style={{ backgroundImage: typeGradient(battler.types, 20) }}
        >
          <img
            src={artworkUrl(battler.id)}
            alt=""
            loading="lazy"
            className="size-10 shrink-0 object-contain"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold text-ink text-sm">{battler.name}</p>
            <p className="text-ink-soft text-xs tabular-nums">
              {battler.hp} / {battler.maxHp} PV
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            {battler.types.map((type) => (
              <TypeBadge key={type} type={type} size="xs" />
            ))}
          </div>
        </button>
      ))}
    </div>
  )
}

export function ActionPanel({ battler, adversaire, chart, remplacants, onAction }: Props) {
  const [mode, setMode] = useState<'attaques' | 'changement'>('attaques')

  if (mode === 'changement') {
    return (
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setMode('attaques')}
          className="flex items-center gap-1.5 font-semibold text-ink-soft text-sm hover:text-ink"
        >
          <ArrowLeftIcon className="size-4" />
          Retour aux attaques
        </button>

        <p className="text-ink-faint text-xs">
          Changer occupe le tour&nbsp;: l'adversaire attaquera avant que le remplaçant n'agisse.
        </p>

        <ListeRemplacants
          remplacants={remplacants}
          onChoisir={(index) => onAction({ kind: 'switch', to: index })}
        />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="font-semibold text-ink-soft text-sm">
        Que doit faire <span className="text-ink">{battler.name}</span> ?
      </p>

      <div className="grid grid-cols-2 gap-2">
        {battler.moves.map((emplacement, slot) => {
          const { move, pp, maxPp } = emplacement
          const epuise = pp <= 0
          const couleur = typeColor(move.type)

          const multiplicateur = chart ? efficaciteContre(chart, move, adversaire.types) : 1
          const efficacite = EFFICACITE[efficaciteDe(multiplicateur)]

          return (
            <button
              key={slot}
              type="button"
              disabled={epuise}
              onClick={() => onAction({ kind: 'move', slot })}
              title={`${move.name} — ${efficacite.libelle} contre ${adversaire.name}`}
              className={`rounded-2xl border px-3 py-2.5 text-left transition ${
                epuise ? 'border-line opacity-40' : 'hover:brightness-110'
              }`}
              style={{
                borderColor: epuise ? undefined : `color-mix(in oklab, ${couleur} 55%, transparent)`,
                backgroundImage: epuise ? undefined : typeGradient([move.type], 18),
              }}
            >
              <span className="flex items-baseline justify-between gap-1.5">
                <span className="truncate font-bold text-ink text-sm">{move.name}</span>
                {/* Le multiplicateur exact plutôt qu'un mot : il tient dans un
                    coin, se lit d'un coup d'œil, et distingue le ×2 du ×4. */}
                <span
                  className={`shrink-0 rounded-md px-1.5 py-0.5 font-black text-[10px] tabular-nums ${efficacite.style}`}
                >
                  {formatMultiplier(multiplicateur)}
                </span>
              </span>

              <span className="mt-1.5 flex items-center justify-between gap-2">
                <TypeBadge type={move.type} size="xs" />
                <span className="text-[10px] text-ink-faint tabular-nums">
                  {move.power} · {pp}/{maxPp} PP
                </span>
              </span>
            </button>
          )
        })}
      </div>

      {remplacants.length > 0 && (
        <button
          type="button"
          onClick={() => setMode('changement')}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-line bg-panel-soft py-2.5 font-semibold text-ink-soft text-sm transition hover:text-ink"
        >
          <SwapIcon className="size-4" />
          Changer de Pokémon
        </button>
      )}
    </div>
  )
}
