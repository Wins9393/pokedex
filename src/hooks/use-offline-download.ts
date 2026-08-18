import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { gql } from '@/api/client'
import { DETAIL_QUERY, FORMS_QUERY, MOVES_QUERY } from '@/api/queries'
import { normalizeBattleForms, normalizeDetails, normalizeMoves } from '@/api/normalize'
import type { RawDetailResponse, RawFormsResponse, RawMovesResponse } from '@/api/normalize'
import type { BattleForm, PokedexIndexData } from '@/api/models'
import { FORMS_QUERY_KEY } from '@/hooks/use-forms'
import { MOVES_QUERY_KEY, capacitesManquantes, chargerMovesets } from '@/hooks/use-moves'
import { INDEX_QUERY_KEY } from '@/hooks/use-pokedex'
import { formesJouables, idsDesFormes } from '@/lib/battle/forms'
import { NOM_CACHE_SPRITES } from '@/lib/cache-sprites'
import { artworkUrl, imagesPrechargees } from '@/lib/sprites'

/*
 * PokéAPI limite le débit sans le dire : passé environ deux cents requêtes
 * rapprochées, ses réponses perdent l'en-tête CORS et tout échoue d'un coup.
 *
 * La parade n'est pas de ralentir mais de **demander moins souvent** : tout
 * ce qui vient de l'API part par lots. Le dex entier tient en 52 requêtes de
 * fiches, 21 de capacités — les 1025 espèces et les 219 formes dans les
 * mêmes lots —, 1 de table d'attaques et 1 de table des formes : 75 en tout,
 * là où la version fiche par fiche en émettait plus d'un millier et se
 * faisait couper autour de la deux centième.
 *
 * Le lot n'est qu'un mode de transport : chaque réponse est ensuite rangée
 * fiche par fiche et vivier par vivier, sous la clé que l'affichage ira
 * lire. Voir `movesetKey` — c'est en gardant les lots comme clés que le
 * mode combat s'est retrouvé injouable hors ligne.
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
    const cache = await caches.open(NOM_CACHE_SPRITES)
    return new Set((await cache.keys()).map((requete) => requete.url))
  } catch {
    return new Set()
  }
}

/**
 * Les identifiants des formes jouables, lus dans le cache. Ils n'existent
 * qu'une fois la table des formes récupérée — d'où le `null`, qui signale
 * « on ne sait pas encore » et non « il n'y en a pas ».
 */
function idsFormesEnCache(client: QueryClient): number[] | null {
  const formes = client.getQueryData<BattleForm[]>([...FORMS_QUERY_KEY])
  const index = client.getQueryData<PokedexIndexData>([...INDEX_QUERY_KEY])
  if (!formes || !index) return null

  return idsDesFormes(formesJouables(formes, new Map(index.pokemon.map((p) => [p.id, p]))))
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
   * On ne compte que les illustrations officielles des espèces : les 1025
   * en ont une, alors que quelques Pokémon récents n'ont pas de sprite
   * animé — et que sur les 219 formes jouables, une n'a aucune
   * illustration et 41 pas de sprite animé. Compter ces images-là rendrait
   * le total définitivement inatteignable, donc elles se téléchargent sans
   * conditionner l'état « complet ».
   */
  const images = ids.filter((id) => presentes.has(artworkUrl(id))).length

  /*
   * Données du mode combat : table des attaques, table des formes, puis un
   * vivier de capacités par combattant — espèces et formes confondues. Le
   * compte se fait combattant par combattant, comme le stockage : compter
   * des lots ne dirait plus rien de ce que le combat saura trouver.
   */
  const idsFormes = idsFormesEnCache(client)
  const combattants = idsFormes ? [...ids, ...idsFormes] : null
  const combat =
    (enCache(client, MOVES_QUERY_KEY) ? 1 : 0) +
    (enCache(client, FORMS_QUERY_KEY) ? 1 : 0) +
    (combattants ? combattants.length - capacitesManquantes(client, combattants).length : 0)

  /*
   * Sans la table des formes, on ignore combien de viviers il reste : le
   * compte requis est délibérément inatteignable pour que l'état ne bascule
   * pas à « complet » sur une ignorance.
   */
  const combatRequis = combattants ? combattants.length + 2 : Number.POSITIVE_INFINITY

  return { fiches, images, combat, combatRequis }
}

/** Vrai si le service worker a déjà cette image, quelle qu'en soit la forme. */
async function dansLeCache(url: string) {
  if (!('caches' in window)) return false
  try {
    const cache = await caches.open(NOM_CACHE_SPRITES)
    // `ignoreVary` : la requête construite ici n'a pas les en-têtes qu'une
    // balise `<img>` envoie, et le CDN fait varier ses réponses dessus.
    return Boolean(await cache.match(url, { ignoreVary: true }))
  } catch {
    return false
  }
}

/**
 * Précharge une image **et vérifie ce qui revient**.
 *
 * Le préchargement se faisait en `no-cors`, pour imiter la requête d'une
 * balise `<img>`. Mais une réponse opaque ne dit rien : son statut est 0,
 * qu'elle porte un PNG ou le 429 que le CDN renvoie quand on le sollicite
 * trop vite. Le service worker rangeait donc le refus dans le cache
 * d'images, pour un an, et le téléchargement le comptait comme une
 * réussite — d'où des vignettes définitivement vides après un
 * téléchargement annoncé complet, sans un seul échec au compteur.
 *
 * En CORS — que `raw.githubusercontent.com` autorise, `access-control-
 * allow-origin: *` — le statut redevient lisible. Un 429 devient un échec :
 * il est retenté, il ralentit la cadence, et la règle Workbox ne le met pas
 * en cache. La réponse déposée sert ensuite les balises `<img>`, qui n'ont
 * pas besoin d'être en CORS pour la lire.
 */
async function precharger(url: string, signal: AbortSignal) {
  try {
    const reponse = await fetch(url, { mode: 'cors', signal })
    if (!reponse.ok) throw new Error(`statut ${reponse.status}`)
  } catch (erreur) {
    /*
     * Une image affichée entre-temps — la grille tourne pendant le
     * téléchargement — est déjà en cache sous forme opaque, et une réponse
     * opaque ne peut pas satisfaire une requête CORS. Le fichier est là :
     * ce n'est pas un échec.
     */
    if (!(await dansLeCache(url))) throw erreur
  }
}

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

/* ------------------------------------------------------------------ *
 * L'avancement, hors de React
 * ------------------------------------------------------------------ */

/**
 * Le téléchargement ne doit dépendre d'aucun composant monté.
 *
 * Il vivait dans l'état du bouton, avec un `AbortController` avorté au
 * démontage : fermer le menu qui l'héberge — ou simplement partir en mode
 * combat, qui a son propre en-tête — suffisait à interrompre l'opération en
 * cours. Le travail est de portée applicative, son état doit l'être aussi.
 *
 * Même mécanique que le thème et les pseudos : un store minuscule, lu par
 * `useSyncExternalStore`. N'importe quel écran peut donc afficher le même
 * avancement, et aucun ne le possède.
 */
type Instantane = {
  etat: EtatHorsLigne
  progression: { fait: number; total: number; echecs: number }
  bloque: boolean
}

let instantane: Instantane = {
  etat: 'mesure',
  progression: { fait: 0, total: 0, echecs: 0 },
  bloque: false,
}

const abonnes = new Set<() => void>()

function publier(suite: Partial<Instantane>) {
  instantane = { ...instantane, ...suite }
  for (const abonne of abonnes) abonne()
}

function souscrire(abonne: () => void) {
  abonnes.add(abonne)
  return () => {
    abonnes.delete(abonne)
  }
}

const lire = () => instantane

/** Hors de React lui aussi : c'est lui qui liait le travail à un composant. */
let controleur: AbortController | null = null

const pourcentageDe = (p: Instantane['progression']) =>
  p.total === 0 ? 0 : Math.round((p.fait / p.total) * 100)

/**
 * Remesure ce qui est déjà en cache.
 *
 * Sans effet pendant un téléchargement : chaque montage d'un composant
 * lecteur la déclenche, et elle écraserait l'état « encours » — la
 * progression disparaîtrait à la réouverture du menu.
 */
async function rafraichir(client: QueryClient, ids: number[]) {
  if (ids.length === 0 || controleur) return

  const { fiches, images, combat, combatRequis } = await mesurer(client, ids)
  const imagesRequises = serviceWorkerActif() ? ids.length : 0

  publier({
    etat:
      fiches >= ids.length && images >= imagesRequises && combat >= combatRequis
        ? 'complet'
        : 'partiel',
  })
}

async function lancerTelechargement(client: QueryClient, ids: number[]) {
    if (ids.length === 0 || controleur) return

    const abandon = new AbortController()
    controleur = abandon
    publier({ bloque: false })

    /*
     * On ne planifie que ce qui manque vraiment. Parcourir aussi ce qui est
     * déjà en cache paierait la pause de cadence pour rien : une reprise
     * après interruption repartirait au rythme d'un téléchargement complet.
     */
    /*
     * La table des formes est récupérée **avant** la planification, et non
     * comptée parmi les tâches : c'est elle qui dit quelles capacités et
     * quelles images restent à chercher. La traiter comme une tâche
     * ordinaire obligerait à publier un total qui changerait en cours de
     * route, sous les yeux de l'utilisateur.
     *
     * Son échec n'arrête rien : le reste se télécharge, et le mode combat
     * reste jouable hors ligne avec les seules formes par défaut.
     */
    if (!enCache(client, FORMS_QUERY_KEY)) {
      try {
        await client.fetchQuery({
          queryKey: [...FORMS_QUERY_KEY],
          queryFn: async ({ signal }) =>
            normalizeBattleForms(await gql<RawFormsResponse>(FORMS_QUERY, undefined, signal)),
          staleTime: Infinity,
          gcTime: Infinity,
          retry: false,
        })
      } catch {
        /* voir ci-dessus : on continue sans les formes */
      }
    }

    if (abandon.signal.aborted) {
      controleur = null
      return
    }

    const idsFormes = idsFormesEnCache(client) ?? []

    const dejaLa = await urlsEnCache()
    const idsManquants = ids.filter(
      (id) => client.getQueryData(['pokedex', 'detail', id]) === undefined,
    )
    /*
     * Les sprites pixel, de face **et de dos**, coûtent presque rien et
     * sauvent le mode combat hors ligne.
     *
     * Sans eux, la chaîne de dos échouait à chaque palier et retombait sur
     * l'illustration : tous les Pokémon du joueur s'affichaient de face,
     * dans l'emplacement défini par le fait qu'on les y voit de dos.
     *
     * Ce sont les versions pixel qui sont préchargées, pas les animées : à
     * 1,1 Ko pièce, les 1244 dos tiennent dans un mégaoctet, contre 93 pour
     * leurs équivalents Showdown — 37 % de plus sur un téléchargement qui
     * pèse déjà 250 Mo. Hors ligne, le Pokémon du joueur est donc net et
     * immobile plutôt qu'animé, mais il est vu du bon côté.
     */
    const urlsManquantes = serviceWorkerActif()
      ? [...ids, ...idsFormes]
          .flatMap(imagesPrechargees)
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
     * Les données du mode combat passent en premier : vingt-trois requêtes
     * — les deux tables et les vingt et un lots de capacités —, pour qu'un
     * téléchargement interrompu tôt laisse quand même les combats jouables
     * hors ligne.
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

    /*
     * Les capacités des formes partent dans les mêmes lots que celles des
     * espèces : 219 identifiants de plus, soit quatre requêtes. Sans elles,
     * une Méga jouée hors ligne se battrait avec le seul vivier de son
     * espèce — jouable, mais amputé de ses attaques propres.
     *
     * Seuls les viviers absents sont demandés, et c'est la fonction du mode
     * combat qui les range : les deux ne peuvent donc pas se manquer.
     */
    for (const lot of decouper(
      capacitesManquantes(client, [...ids, ...idsFormes]),
      TAILLE_LOT_CAPACITES,
    )) {
      combat.push(() => chargerMovesets(client, lot, abandon.signal))
    }

    const total = combat.length + donnees.length + images.length
    const rapport: Rapport = { fait: 0, echecs: 0, bloque: false }

    publier({ progression: { fait: 0, total, echecs: 0 }, etat: 'encours' })

    const battement = window.setInterval(
      () => publier({ progression: { fait: rapport.fait, total, echecs: rapport.echecs } }),
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
      publier({
        progression: { fait: rapport.fait, total, echecs: rapport.echecs },
        bloque: rapport.bloque,
      })
      controleur = null
      await rafraichir(client, ids)
    }
}

/* ------------------------------------------------------------------ *
 * Lecture depuis React
 * ------------------------------------------------------------------ */

export function useOfflineDownload(ids: number[]) {
  const client = useQueryClient()
  const vue = useSyncExternalStore(souscrire, lire, lire)

  useEffect(() => {
    void rafraichir(client, ids)
  }, [client, ids])

  const lancer = useCallback(() => lancerTelechargement(client, ids), [client, ids])
  const annuler = useCallback(() => controleur?.abort(), [])

  return {
    etat: vue.etat,
    progression: vue.progression,
    pourcentage: pourcentageDe(vue.progression),
    bloque: vue.bloque,
    lancer,
    annuler,
    avecImages: serviceWorkerActif(),
  }
}

/**
 * Lecture seule de l'avancement, sans mesure ni identifiants.
 *
 * Pour l'afficher là où le bouton n'est pas — sur la commande du menu quand
 * celui-ci est fermé, faute de quoi un téléchargement lancé puis replié
 * n'aurait plus aucun signe extérieur.
 */
export function useProgressionHorsLigne() {
  const vue = useSyncExternalStore(souscrire, lire, lire)
  return { enCours: vue.etat === 'encours', pourcentage: pourcentageDe(vue.progression) }
}
