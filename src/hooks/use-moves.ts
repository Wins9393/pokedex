import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { gql } from '@/api/client'
import { MOVES_QUERY, MOVESETS_QUERY } from '@/api/queries'
import { normalizeMoves, normalizeMovesets } from '@/api/normalize'
import type { RawMovesResponse, RawMovesetsResponse } from '@/api/normalize'
import type { Move, Movesets } from '@/api/models'

/**
 * Le `v2` date de l'arrivée des archétypes de geste : les entrées déjà
 * persistées n'ont pas ce champ, et une attaque sans geste faisait tomber
 * l'arène. Une clé versionnée plutôt que le `buster` global de `main.tsx`,
 * qui aurait jeté du même coup les ~6 Mo de fiches téléchargées pour le
 * hors-ligne — ici seules les 60 Ko du vivier sont à reprendre.
 */
export const MOVES_QUERY_KEY = ['pokedex', 'moves', 'v2'] as const

/**
 * Même mémorisation que l'index : la table par identifiant est identique
 * pour tous les composants et coûteuse à reconstruire, donc on l'attache à
 * la référence des données plutôt qu'à un `useMemo` par instance.
 */
let indexCache: { source: Move[]; byId: Map<number, Move> } | null = null

function indexMoves(moves: Move[]): Map<number, Move> {
  if (indexCache?.source === moves) return indexCache.byId

  const byId = new Map(moves.map((move) => [move.id, move]))
  indexCache = { source: moves, byId }
  return byId
}

/**
 * Le vivier d'attaques : 394 attaques offensives, chargées une seule fois
 * pour tout le mode combat (77 Ko, 7 Ko compressés).
 */
export function useMoves(enabled = true) {
  const query = useQuery({
    queryKey: MOVES_QUERY_KEY,
    queryFn: async ({ signal }) =>
      normalizeMoves(await gql<RawMovesResponse>(MOVES_QUERY, undefined, signal)),
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
  })

  return {
    moves: query.data,
    byId: query.data ? indexMoves(query.data) : undefined,
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
  }
}

/**
 * Le vivier d'un seul Pokémon — l'unité de stockage.
 *
 * C'est le point qui rendait le mode combat injouable hors ligne. Le
 * téléchargement demandait les capacités par lots de soixante et rangeait
 * chaque réponse sous la clé de son lot ; le combat, lui, demandait celles
 * de ses six Pokémon et cherchait sous la clé de ce sextuor. Deux clés qui
 * ne se rencontrent jamais : le dex était bien téléchargé, et le combat
 * repartait quand même au réseau — là où, sans réseau, il n'y a rien.
 *
 * Le lot est donc redevenu ce qu'il aurait toujours dû être, un détail de
 * transport : on demande à plusieurs, on range un par un.
 */
export const movesetKey = (id: number) => ['pokedex', 'moveset', id] as const

/**
 * Clé de la jointure d'un groupe, stable quel que soit l'ordre de sélection.
 *
 * Éphémère, contrairement aux viviers qu'elle rassemble : elle ne fait que
 * porter l'état de chargement d'un écran, et son `gcTime` par défaut la fait
 * disparaître après le combat plutôt que de garder une entrée par équipe
 * jamais rejouée.
 */
export const viviersKey = (ids: readonly number[]) =>
  ['pokedex', 'viviers', [...ids].sort((a, b) => a - b).join(',')] as const

/**
 * Les viviers d'un groupe de Pokémon : ce qui est déjà connu vient du
 * cache, le reste part en une seule requête.
 *
 * Partagée par le mode combat et le téléchargement hors ligne. C'est
 * volontaire : tant que les deux passent par ici, ils ne peuvent plus
 * diverger sur la forme des clés, et ce qu'un télécharge, l'autre le
 * trouve.
 */
export async function chargerMovesets(
  client: QueryClient,
  ids: readonly number[],
  signal?: AbortSignal,
): Promise<Movesets> {
  const viviers: Movesets = {}
  const manquants: number[] = []

  for (const id of ids) {
    const connu = client.getQueryData<number[]>([...movesetKey(id)])
    if (connu) viviers[id] = connu
    else manquants.push(id)
  }

  if (manquants.length === 0) return viviers

  const frais = normalizeMovesets(
    await gql<RawMovesetsResponse>(MOVESETS_QUERY, { ids: manquants }, signal),
  )

  for (const id of manquants) {
    /*
     * Une entrée pour **chaque** identifiant demandé, le vide compris : 50
     * des 219 formes jouables n'ont aucune capacité propre dans l'API, et
     * sans trace écrite de cette absence, le téléchargement les
     * redemanderait à chaque passage sans jamais se déclarer complet.
     */
    const vivier = frais[id] ?? []
    client.setQueryData([...movesetKey(id)], vivier)
    viviers[id] = vivier
  }

  return viviers
}

/** Les identifiants dont le vivier n'est pas encore en cache. */
export const capacitesManquantes = (client: QueryClient, ids: readonly number[]) =>
  ids.filter((id) => client.getQueryData([...movesetKey(id)]) === undefined)

/**
 * Les capacités apprenables d'un groupe de Pokémon. Les six membres des
 * deux équipes partent ensemble : c'est le moment naturel pour afficher un
 * écran de préparation, et un aller-retour vaut mieux que six.
 *
 * Hors ligne après un téléchargement complet, il n'y a aucun aller-retour :
 * tout se lit dans le cache.
 */
export function useMovesets(ids: readonly number[]) {
  const client = useQueryClient()
  const query = useQuery({
    queryKey: viviersKey(ids),
    queryFn: ({ signal }) => chargerMovesets(client, ids, signal),
    enabled: ids.length > 0,
    staleTime: Infinity,
  })

  return {
    movesets: query.data,
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}
