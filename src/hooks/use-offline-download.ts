import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { gql } from '@/api/client'
import { DETAIL_QUERY } from '@/api/queries'
import { normalizeDetail } from '@/api/normalize'
import type { RawDetailResponse } from '@/api/normalize'
import { artworkUrl, showdownUrl } from '@/lib/sprites'

/** Nom du cache déclaré dans la règle Workbox de `vite.config.ts`. */
const CACHE_SPRITES = 'pokemon-sprites'

/*
 * PokéAPI limite le débit sans le dire : passé environ deux cents requêtes
 * rapprochées, ses réponses perdent l'en-tête CORS et tout échoue d'un coup.
 * D'où une cadence prudente sur les données, et une pause qui s'allonge
 * d'elle-même dès que ça coince.
 */
const CONCURRENCE_DONNEES = 3
const CONCURRENCE_IMAGES = 6
const PAUSE_INITIALE = 80
const PAUSE_MAX = 2500
const TENTATIVES = 3

/** Au-delà, il ne s'agit plus d'aléas mais d'un blocage : inutile d'insister. */
const ECHECS_CONSECUTIFS_MAX = 30

/** Publication de l'avancement : au fichier près, ce serait des milliers de rendus. */
const PERIODE_RAFRAICHISSEMENT = 200

export type EtatHorsLigne = 'mesure' | 'partiel' | 'encours' | 'complet'

/**
 * Attente interruptible. Avec un `setTimeout` nu, un ouvrier en pleine
 * temporisation de reprise — jusqu'à plusieurs secondes — ne verrait
 * l'annulation qu'à son réveil, et le bouton resterait figé d'autant.
 */
function attendre(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resoudre) => {
    if (signal?.aborted) {
      resoudre()
      return
    }
    let minuteur = 0
    const fin = () => {
      window.clearTimeout(minuteur)
      signal?.removeEventListener('abort', fin)
      resoudre()
    }
    minuteur = window.setTimeout(fin, ms)
    signal?.addEventListener('abort', fin, { once: true })
  })
}

/*
 * Les images ne sont mises en cache que par le service worker, qui
 * intercepte les requêtes. Sans lui — en développement, ou avant sa
 * première activation — les précharger ne laisserait aucune trace : on se
 * limite alors aux fiches, qui passent par IndexedDB.
 */
const serviceWorkerActif = () => Boolean(navigator.serviceWorker?.controller)

/** Les URLs déjà stockées par le service worker, ou un ensemble vide sans lui. */
async function urlsEnCache(): Promise<Set<string>> {
  if (!('caches' in window)) return new Set()
  try {
    const cache = await caches.open(CACHE_SPRITES)
    return new Set((await cache.keys()).map((requete) => requete.url))
  } catch {
    return new Set()
  }
}

/**
 * L'état est *mesuré*, jamais mémorisé. Un drapeau « déjà téléchargé »
 * mentirait dès que le navigateur purge le stockage sous pression disque,
 * ce qu'il fait sans prévenir.
 */
async function mesurer(client: QueryClient, ids: number[]) {
  const fiches = client
    .getQueryCache()
    .findAll({ queryKey: ['pokedex', 'detail'] })
    .filter((query) => query.state.status === 'success').length

  const presentes = await urlsEnCache()
  /*
   * On ne compte que les illustrations officielles : les 1025 espèces en ont
   * une, alors que quelques Pokémon récents n'ont pas de sprite animé.
   * Compter les deux rendrait le total inatteignable.
   */
  const images = ids.filter((id) => presentes.has(artworkUrl(id))).length

  return { fiches, images }
}

/**
 * Reproduit exactement la requête d'une balise `<img>` : même URL, même
 * mode sans CORS, donc même clé de cache. Une image préchargée autrement
 * serait stockée sans jamais être réutilisée à l'affichage.
 */
const precharger = (url: string, signal: AbortSignal) =>
  fetch(url, { mode: 'no-cors', signal }).then(() => undefined)

type Rapport = { fait: number; echecs: number; bloque: boolean }

/**
 * File d'attente à cadence auto-ajustée : la pause entre deux requêtes
 * s'allonge à chaque échec et redescend quand ça repasse, ce qui suit la
 * limite du serveur sans avoir à la connaître.
 */
async function executer(
  taches: Array<() => Promise<unknown>>,
  concurrence: number,
  signal: AbortSignal,
  rapport: Rapport,
) {
  let curseur = 0
  let pause = PAUSE_INITIALE
  let consecutifs = 0

  const ouvrier = async () => {
    while (curseur < taches.length && !signal.aborted && !rapport.bloque) {
      const tache = taches[curseur++]
      let reussi = false

      for (let essai = 0; essai < TENTATIVES && !signal.aborted; essai++) {
        try {
          await tache()
          reussi = true
          break
        } catch {
          // Palier croissant avec un peu de bruit, pour que les ouvriers ne
          // repartent pas tous exactement en même temps.
          if (essai < TENTATIVES - 1)
            await attendre(pause * 2 ** essai + Math.random() * 200, signal)
        }
      }

      if (reussi) {
        consecutifs = 0
        pause = Math.max(PAUSE_INITIALE, pause * 0.9)
      } else {
        rapport.echecs += 1
        consecutifs += 1
        pause = Math.min(PAUSE_MAX, pause * 1.6)
        if (consecutifs >= ECHECS_CONSECUTIFS_MAX) rapport.bloque = true
      }

      rapport.fait += 1
      await attendre(pause, signal)
    }
  }

  await Promise.all(Array.from({ length: concurrence }, ouvrier))
}

export function useOfflineDownload(ids: number[]) {
  const client = useQueryClient()
  const [etat, setEtat] = useState<EtatHorsLigne>('mesure')
  const [progression, setProgression] = useState({ fait: 0, total: 0, echecs: 0 })
  const [bloque, setBloque] = useState(false)
  const controleur = useRef<AbortController | null>(null)

  const rafraichir = useCallback(async () => {
    if (ids.length === 0) return
    const { fiches, images } = await mesurer(client, ids)
    const imagesRequises = serviceWorkerActif() ? ids.length : 0
    setEtat(fiches >= ids.length && images >= imagesRequises ? 'complet' : 'partiel')
  }, [client, ids])

  useEffect(() => {
    void rafraichir()
  }, [rafraichir])

  useEffect(() => () => controleur.current?.abort(), [])

  const annuler = useCallback(() => controleur.current?.abort(), [])

  const lancer = useCallback(async () => {
    if (ids.length === 0 || controleur.current) return

    const abandon = new AbortController()
    controleur.current = abandon
    setBloque(false)

    /*
     * On ne planifie que ce qui manque vraiment. Parcourir aussi ce qui est
     * déjà en cache paierait la pause de cadence pour rien : une reprise
     * après interruption repartirait au rythme d'un téléchargement complet.
     */
    const dejaLa = await urlsEnCache()
    const idsManquants = ids.filter(
      (id) => client.getQueryData(['pokedex', 'detail', id]) === undefined,
    )
    const urlsManquantes = serviceWorkerActif()
      ? ids
          .flatMap((id) => [artworkUrl(id), showdownUrl(id)])
          .filter((url) => !dejaLa.has(url))
      : []

    const donnees: Array<() => Promise<unknown>> = idsManquants.map(
      (id) => () =>
        client.fetchQuery({
          queryKey: ['pokedex', 'detail', id],
          queryFn: async ({ signal }) =>
            normalizeDetail(await gql<RawDetailResponse>(DETAIL_QUERY, { id }, signal)),
          staleTime: Infinity,
          gcTime: Infinity,
          // La reprise est gérée ici, avec sa propre cadence : laisser aussi
          // TanStack réessayer superposerait deux logiques de temporisation.
          retry: false,
        }),
    )

    const images: Array<() => Promise<unknown>> = urlsManquantes.map(
      (url) => () => precharger(url, abandon.signal),
    )

    const total = donnees.length + images.length
    const rapport: Rapport = { fait: 0, echecs: 0, bloque: false }

    setProgression({ fait: 0, total, echecs: 0 })
    setEtat('encours')

    const battement = window.setInterval(
      () => setProgression({ fait: rapport.fait, total, echecs: rapport.echecs }),
      PERIODE_RAFRAICHISSEMENT,
    )

    try {
      await executer(donnees, CONCURRENCE_DONNEES, abandon.signal, rapport)
      if (!rapport.bloque && !abandon.signal.aborted) {
        await executer(images, CONCURRENCE_IMAGES, abandon.signal, rapport)
      }
    } finally {
      window.clearInterval(battement)
      setProgression({ fait: rapport.fait, total, echecs: rapport.echecs })
      setBloque(rapport.bloque)
      controleur.current = null
      await rafraichir()
    }
  }, [client, ids, rafraichir])

  const pourcentage =
    progression.total === 0 ? 0 : Math.round((progression.fait / progression.total) * 100)

  return {
    etat,
    progression,
    pourcentage,
    bloque,
    lancer,
    annuler,
    avecImages: serviceWorkerActif(),
  }
}
