import { useState } from 'react'
import { TypeBadge } from '@/components/ui/TypeBadge'
import { ArrowLeftIcon, SwapIcon } from '@/components/ui/icons'
import type { Action, Battler } from '@/lib/battle/types'
import { typeColor, typeGradient } from '@/lib/pokemon-types'
import { artworkUrl } from '@/lib/sprites'

type Remplacant = { battler: Battler; index: number }

type Props = {
  battler: Battler
  remplacants: Remplacant[]
  onAction: (action: Action) => void
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

export function ActionPanel({ battler, remplacants, onAction }: Props) {
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

          return (
            <button
              key={slot}
              type="button"
              disabled={epuise}
              onClick={() => onAction({ kind: 'move', slot })}
              className={`rounded-2xl border px-3 py-2.5 text-left transition ${
                epuise ? 'border-line opacity-40' : 'hover:brightness-110'
              }`}
              style={{
                borderColor: epuise ? undefined : `color-mix(in oklab, ${couleur} 55%, transparent)`,
                backgroundImage: epuise ? undefined : typeGradient([move.type], 18),
              }}
            >
              <span className="block truncate font-bold text-ink text-sm">{move.name}</span>

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
