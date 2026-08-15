import { useMemo } from 'react'
import { CheckIcon, DownloadIcon } from '@/components/ui/icons'
import { useOfflineDownload } from '@/hooks/use-offline-download'
import { usePokedex } from '@/hooks/use-pokedex'

/**
 * Le bouton lit l'index par la même clé de requête que la page : aucune
 * requête supplémentaire, et aucune propriété à faire descendre.
 */
export function OfflineButton() {
  const { pokemon } = usePokedex()
  const ids = useMemo(() => (pokemon ?? []).map((entry) => entry.id), [pokemon])
  const { etat, progression, pourcentage, bloque, lancer, annuler, avecImages } =
    useOfflineDownload(ids)

  // Tant que la mesure n'a pas abouti, ne rien afficher : un bouton qui
  // apparaîtrait puis disparaîtrait aussitôt serait plus gênant qu'absent.
  if (etat === 'mesure') return null

  if (etat === 'encours') {
    return (
      <button
        type="button"
        onClick={annuler}
        title={`Annuler — ${progression.fait} / ${progression.total}`}
        className="flex items-center gap-1.5 rounded-full border border-transparent bg-accent px-3 py-2 font-semibold text-sm text-white transition"
      >
        <DownloadIcon className="size-4 animate-pulse" />
        <span className="tabular-nums" aria-live="polite">
          {pourcentage} %
        </span>
        <span className="sr-only">téléchargement en cours, cliquer pour annuler</span>
      </button>
    )
  }

  const complet = etat === 'complet'
  const volume = avecImages ? '≈ 200 Mo' : '≈ 40 Mo, images exclues hors production'

  /*
   * Un blocage n'est pas un échec définitif : PokéAPI limite le débit, et
   * relancer plus tard reprend là où l'on s'était arrêté, puisque les fiches
   * déjà en cache ne sont pas redemandées.
   */
  const restes = bloque
    ? ' — limite de l’API atteinte, reprendre plus tard'
    : progression.echecs > 0
      ? ` — ${progression.echecs} élément(s) indisponible(s)`
      : ''

  return (
    <button
      type="button"
      onClick={complet ? undefined : () => void lancer()}
      disabled={complet}
      title={
        complet
          ? 'Dex complet disponible hors ligne'
          : `Télécharger tout le dex pour un usage hors ligne (${volume})${restes}`
      }
      aria-label={
        complet
          ? 'Dex complet disponible hors ligne'
          : 'Télécharger tout le dex pour un usage hors ligne'
      }
      className={`grid size-9 place-items-center rounded-full border transition ${
        complet
          ? 'cursor-default border-line bg-panel-soft text-emerald-500'
          : 'border-line bg-panel-soft text-ink-soft hover:text-ink'
      }`}
    >
      {complet ? <CheckIcon className="size-4.5" /> : <DownloadIcon className="size-4.5" />}
    </button>
  )
}
