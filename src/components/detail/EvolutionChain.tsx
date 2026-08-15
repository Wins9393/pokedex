import type { EvolutionNode } from '@/api/models'
import { formatDexNumber } from '@/lib/format'
import { typeGradient } from '@/lib/pokemon-types'
import { artworkUrl } from '@/lib/sprites'

type Props = {
  nodes: EvolutionNode[]
  currentId: number
  onNavigate: (id: number) => void
}

function EvolutionCard({
  node,
  current,
  onNavigate,
}: {
  node: EvolutionNode
  current: boolean
  onNavigate: (id: number) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(node.speciesId)}
      aria-current={current ? 'true' : undefined}
      // Le Pokémon courant est signalé par un aplat teinté et un liseré
      // intérieur, plutôt que par un `ring` : celui-ci se dessine hors de
      // la boîte et débordait du conteneur défilant.
      className={`flex w-[104px] shrink-0 flex-col items-center gap-1 rounded-2xl p-2 transition hover:-translate-y-0.5 ${
        current
          ? 'bg-accent/12 ring-1 ring-accent/40 ring-inset'
          : 'hover:bg-panel-soft'
      }`}
    >
      <div
        className="grid size-[76px] place-items-center rounded-full"
        style={{ background: typeGradient(node.types, 22) }}
      >
        <img
          src={artworkUrl(node.pokemonId)}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-[64px] object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.3)]"
        />
      </div>
      <span
        className={`text-center font-semibold text-xs leading-tight ${
          current ? 'text-accent' : 'text-ink'
        }`}
      >
        {node.name}
      </span>
      <span
        className={`text-[10px] tabular-nums ${current ? 'text-accent/70' : 'text-ink-faint'}`}
      >
        {formatDexNumber(node.speciesId)}
      </span>
    </button>
  )
}

function Arrow({ conditions }: { conditions: string[] }) {
  return (
    <div className="flex min-w-[92px] shrink-0 flex-col items-center gap-1 px-1">
      <span className="text-center text-[10px] text-ink-soft leading-tight">
        {conditions.join(' ou ') || '—'}
      </span>
      <span aria-hidden="true" className="text-ink-faint text-lg leading-none">
        →
      </span>
    </div>
  )
}

function Branch({
  node,
  currentId,
  onNavigate,
}: {
  node: EvolutionNode
  currentId: number
  onNavigate: (id: number) => void
}) {
  return (
    <div className="flex items-center">
      <EvolutionCard node={node} current={node.speciesId === currentId} onNavigate={onNavigate} />

      {node.children.length > 0 && (
        <div className={node.children.length > 1 ? 'flex flex-col gap-1.5' : 'flex'}>
          {node.children.map((child) => (
            <div key={child.speciesId} className="flex items-center">
              <Arrow conditions={child.conditions} />
              <Branch node={child} currentId={currentId} onNavigate={onNavigate} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function EvolutionChain({ nodes, currentId, onNavigate }: Props) {
  const hasEvolution = nodes.some((node) => node.children.length > 0)

  if (!hasEvolution) {
    return (
      <p className="text-ink-faint text-sm">Ce Pokémon n'évolue pas et ne provient d'aucune évolution.</p>
    )
  }

  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-2">
      <div className="flex w-max items-center">
        {nodes.map((node) => (
          <Branch key={node.speciesId} node={node} currentId={currentId} onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  )
}
