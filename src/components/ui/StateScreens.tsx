import { PokeballIcon } from './icons'

export function LoadingScreen({ label = 'Chargement du Pokédex…' }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6">
      <div className="relative">
        <PokeballIcon className="size-20 animate-spin-slow text-accent" />
        <div className="absolute inset-0 animate-ping rounded-full bg-accent/20" />
      </div>
      <div className="text-center">
        <p className="font-semibold text-ink text-lg">{label}</p>
        <p className="mt-1 text-ink-faint text-sm">1025 espèces en une seule requête</p>
      </div>
    </div>
  )
}

export function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 text-center">
      <div className="grid size-16 place-items-center rounded-full bg-accent/15 text-3xl">⚠️</div>
      <div>
        <p className="font-bold text-ink text-xl">Le Pokédex n'a pas répondu</p>
        <p className="mt-2 max-w-md text-ink-soft text-sm">{message}</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-full bg-accent px-6 py-2.5 font-semibold text-sm text-white transition hover:brightness-110"
      >
        Réessayer
      </button>
    </div>
  )
}
