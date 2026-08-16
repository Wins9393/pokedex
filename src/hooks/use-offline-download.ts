import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { gql } from '@/api/client'
import { DETAIL_QUERY, MOVES_QUERY, MOVESETS_QUERY } from '@/api/queries'
import { normalizeDetails, normalizeMoves, normalizeMovesets } from '@/api/normalize'
import type { RawDetailResponse, RawMovesResponse, RawMovesetsResponse } from '@/api/normalize'
import { MOVES_QUERY_KEY, movesetsKey } from '@/hooks/use-moves'
import { artworkUrl, showdownUrl } from '@/lib/sprites'

/** Nom du cache déclaré dans la règle Workbox de `vite.config.ts`. */
const CACHE_SPRITES = 'pokemon-sprites'

/*
 * PokéAPI limite le débit sans le dire : passé environ deux cents requêtes
 * rapprochées, ses réponses perdent l'en-tête CORS et tout échoue d'un coup.
 *
 * La parade n'est pas de ralentir mais de **demander moins souvent** : tout
 * ce qui vient de l'API part par lots. Le dex entier tient en 52 requêtes de
 * fiches, 18 de capacités et 1 de table d'attaques — 71 en tout, là où la
 * version fiche par fiche en émettait plus d'un millier et se faisait couper
 * autour de la deux centième.
 */
const TAILLE_LOT_FICHES = 20
const TAILLE_LOT_CAPACITES = 60

/** Deux requêtes de front suffisent : chacune ramène déjà des centaines de kilooctets. */
const CONCURRENCE_API = 2
const CONCURRENCE_IMAGES = 6

const PAUSE_API = 350
const PAUSE_IMAGES = 40
const PAUSE_MAX = 5000
const TENTATIVES = 3

/** Au-delà, il ne s'agit plus d'aléas mais d'un blocage : inutile d'insister. */
const ECHECS_CONSECUTIFS_MAX = 8

/** Publication de l'avancement : au fichier près, ce serait des milliers de rendus. */
const PERIODE_RAFRAICHISSEMENT = 200

const decouper = (ids: readonly number[], taille: number): number[][] => {
  const lots: number[][] = []
  for (let debut = 0; debut < ids.length; debut += taille) {
    lots.push(ids.slice(debut, debut + taille))
  }
  return lots
}

const lotsDeCapacites = (ids: readonly number[]) => decouper(ids, TAILLE_LOT_CAPACITES)

const enCache = (client: QueryClient, cle: readonly unknown[]) =>
  client.getQueryState([...cle])?.status === 'success'

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

  // Données du mode combat : la table des attaques, puis les capacités par lots.
  const lots = lotsDeCapacites(ids)
  const combat =
    (enCache(client, MOVES_QUERY_KEY) ? 1 : 0) +
    lots.filter((lot) => enCache(client, movesetsKey(lot))).length

  return { fiches, images, combat, combatRequis: lots.length + 1 }
}

/**
 * Reproduit exactement la requête d'une balise `<img>` : même URL, même
 * mode sans CORS, donc même clé de cache. Une image préchargée autrement
 * serait stockée sans jamais être réutilisée à l'affichage.
 */
const precharger = (url: string, signal: AbortSignal) =>
  fetch(url, { mode: 'no-cors', signal }).then(() => undefined)

type Rapport = { fait: number; echecs: number; bloque: boolean }

type Cadence = { concurrence: number; pauseBase: number }

/**
 * File d'attente à cadence auto-ajustée : la pause entre deux requêtes
 * s'allonge à chaque échec et redescend quand ça repasse, ce qui suit la
 * limite du serveur sans avoir à la connaître.
 *
 * Le blocage est **propre à la phase** et renvoyé à l'appelant, au lieu
 * d'arrêter tout le téléchargement. Les images viennent d'un CDN qui n'a
 * rien à voir avec PokéAPI : les abandonner parce que l'API a coupé serait
 * renoncer aux trois quarts du travail sans raison.
 */
async function executer(
  taches: Array<() => Promise<unknown>>,
  cadence: Cadence,
  signal: AbortSignal,
  rapport: Rapport,
): Promise<boolean> {
  let curseur = 0
  let pause = cadence.pauseBase
  let consecutifs = 0
  let bloque = false

  const ouvrier = async () => {
    while (curseur < taches.length && !signal.aborted && !bloque) {
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
        pause = Math.max(cadence.pauseBase, pause * 0.9)
      } else {
        rapport.echecs += 1
        consecutifs += 1
        pause = Math.min(PAUSE_MAX, pause * 1.6)
        if (consecutifs >= ECHECS_CONSECUTIFS_MAX) bloque = true
      }

      rapport.fait += 1
      await attendre(pause, signal)
    }
  }

  await Promise.all(Array.from({ length: cadence.concurrence }, ouvrier))

  if (bloque) rapport.bloque = true
  return bloque
}

export function useOfflineDownload(ids: number[]) {
  const client = useQueryClient()
  const [etat, setEtat] = useState<EtatHorsLigne>('mesure')
  const [progression, setProgression] = useState({ fait: 0, total: 0, echecs: 0 })
  const [bloque, setBloque] = useState(false)
  const controleur = useRef<AbortController | null>(null)

  const rafraichir = useCallback(async () => {
    if (ids.length === 0) return
    const { fiches, images, combat, combatRequis } = await mesurer(client, ids)
    const imagesRequises = serviceWorkerActif() ? ids.length : 0
    setEtat(
      fiches >= ids.length && images >= imagesRequises && combat >= combatRequis
        ? 'complet'
        : 'partiel',
    )
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

    /*
     * Les fiches partent par lots de vingt et sont réparties une à une dans
     * le cache : chacune garde sa propre clé, donc reste lisible par la fiche
     * détail comme si elle avait été demandée seule.
     *
     * C'est ce groupement qui rend le téléchargement possible. Une requête
     * par Pokémon en faisait 1025, et PokéAPI coupait vers la deux centième —
     * le téléchargement plafonnait alors autour de 10 %.
     */
    const donnees: Array<() => Promise<unknown>> = decouper(
      idsManquants,
      TAILLE_LOT_FICHES,
    ).map((lot) => async () => {
      const brut = await gql<RawDetailResponse>(DETAIL_QUERY, { ids: lot }, abandon.signal)
      for (const fiche of normalizeDetails(brut)) {
        client.setQueryData(['pokedex', 'detail', fiche.id], fiche)
      }
    })

    const images: Array<() => Promise<unknown>> = urlsManquantes.map(
      (url) => () => precharger(url, abandon.signal),
    )

    /*
     * Les données du mode combat passent en premier : dix-neuf requêtes,
     * pour qu'un téléchargement interrompu tôt laisse quand même les
     * combats jouables hors ligne.
     */
    const combat: Array<() => Promise<unknown>> = []

    if (!enCache(client, MOVES_QUERY_KEY)) {
      combat.push(() =>
        client.fetchQuery({
          queryKey: [...MOVES_QUERY_KEY],
          queryFn: async ({ signal }) =>
            normalizeMoves(await gql<RawMovesResponse>(MOVES_QUERY, undefined, signal)),
          staleTime: Infinity,
          gcTime: Infinity,
          retry: false,
        }),
      )
    }

    for (const lot of lotsDeCapacites(ids)) {
      if (enCache(client, movesetsKey(lot))) continue
      combat.push(() =>
        client.fetchQuery({
          queryKey: [...movesetsKey(lot)],
          queryFn: async ({ signal }) =>
            normalizeMovesets(
              await gql<RawMovesetsResponse>(MOVESETS_QUERY, { ids: lot }, signal),
            ),
          staleTime: Infinity,
          gcTime: Infinity,
          retry: false,
        }),
      )
    }

    const total = combat.length + donnees.length + images.length
    const rapport: Rapport = { fait: 0, echecs: 0, bloque: false }

    setProgression({ fait: 0, total, echecs: 0 })
    setEtat('encours')

    const battement = window.setInterval(
      () => setProgression({ fait: rapport.fait, total, echecs: rapport.echecs }),
      PERIODE_RAFRAICHISSEMENT,
    )

    const cadenceApi = { concurrence: CONCURRENCE_API, pauseBase: PAUSE_API }

    try {
      const coupe = await executer(combat, cadenceApi, abandon.signal, rapport)

      if (!coupe && !abandon.signal.aborted) {
        await executer(donnees, cadenceApi, abandon.signal, rapport)
      }

      /*
       * Les images sont servies par un CDN sans rapport avec PokéAPI : elles
       * se téléchargent même si l'API vient de couper. Les abandonner par
       * solidarité reviendrait à renoncer aux trois quarts du travail.
       */
      if (!abandon.signal.aborted) {
        await executer(
          images,
          { concurrence: CONCURRENCE_IMAGES, pauseBase: PAUSE_IMAGES },
          abandon.signal,
          rapport,
        )
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
