import { PokeballIcon } from '@/components/ui/icons'

type Props = {
  onReset: () => void
}

export function EmptyState({ onReset }: Props) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-line border-dashed px-6 py-20 text-center">
      <PokeballIcon className="size-16 text-ink-faint opacity-60" />
      <p className="mt-5 font-bold text-ink text-xl">Aucun Pokémon ne correspond</p>
      <p className="mt-2 max-w-sm text-ink-soft text-sm">
        Les critères combinés ne laissent passer personne. Essayez d'élargir une plage de stats ou
        de retirer un type.
      </p>
      <button
        type="button"
        onClick={onReset}
        className="mt-6 rounded-full bg-accent px-5 py-2.5 font-semibold text-sm text-white transition hover:brightness-110"
      >
        Réinitialiser les filtres
      </button>
    </div>
  )
}
