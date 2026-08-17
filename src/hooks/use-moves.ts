import { useQuery } from '@tanstack/react-query'
import { gql } from '@/api/client'
import { MOVES_QUERY, MOVESETS_QUERY } from '@/api/queries'
import { normalizeMoves, normalizeMovesets } from '@/api/normalize'
import type { RawMovesResponse, RawMovesetsResponse } from '@/api/normalize'
import type { Move } from '@/api/models'

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

/** Clé stable quel que soit l'ordre de sélection des Pokémon. */
export const movesetsKey = (ids: readonly number[]) =>
  ['pokedex', 'movesets', [...ids].sort((a, b) => a - b).join(',')] as const

/**
 * Les capacités apprenables d'un lot de Pokémon, en une requête. Les six
 * membres des deux équipes partent ensemble : c'est le moment naturel pour
 * afficher un écran de préparation, et un aller-retour vaut mieux que six.
 */
export function useMovesets(ids: readonly number[]) {
  const query = useQuery({
    queryKey: movesetsKey(ids),
    queryFn: async ({ signal }) =>
      normalizeMovesets(
        await gql<RawMovesetsResponse>(MOVESETS_QUERY, { ids: [...ids] }, signal),
      ),
    enabled: ids.length > 0,
    staleTime: Infinity,
    gcTime: Infinity,
  })

  return {
    movesets: query.data,
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
  }
}
