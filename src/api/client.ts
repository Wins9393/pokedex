/**
 * Client GraphQL minimal pour PokéAPI.
 *
 * Tout passe par cet endpoint plutôt que par l'API REST : une seule
 * requête suffit à charger l'index complet des 1025 espèces (~620 Ko,
 * 62 Ko une fois compressé) là où le REST demanderait ~1300 appels.
 *
 * Attention : l'ancien endpoint `beta.pokeapi.co/graphql/v1beta` expose
 * un schéma différent (tables préfixées `pokemon_v2_`). Les requêtes de
 * ce dossier sont écrites pour le schéma v1beta2 ci-dessous et ne sont
 * pas interchangeables.
 */

const ENDPOINT = 'https://graphql.pokeapi.co/v1beta2'

type GraphQLResponse<T> = {
  data?: T
  errors?: { message: string }[]
}

export class PokeApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PokeApiError'
  }
}

export async function gql<T>(
  query: string,
  variables?: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal,
  })

  if (!response.ok) {
    throw new PokeApiError(`PokéAPI a répondu ${response.status} ${response.statusText}`)
  }

  const payload = (await response.json()) as GraphQLResponse<T>

  if (payload.errors?.length) {
    throw new PokeApiError(payload.errors.map((e) => e.message).join(' · '))
  }
  if (!payload.data) {
    throw new PokeApiError('Réponse vide de PokéAPI')
  }

  return payload.data
}
