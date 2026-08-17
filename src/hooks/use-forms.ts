import { useQuery } from '@tanstack/react-query'
import { gql } from '@/api/client'
import { FORMS_QUERY } from '@/api/queries'
import { normalizeBattleForms } from '@/api/normalize'
import type { RawFormsResponse } from '@/api/normalize'
import type { BattleForm, PokemonSummary } from '@/api/models'
import { formesJouables } from '@/lib/battle/forms'

export const FORMS_QUERY_KEY = ['pokedex', 'formes'] as const

/**
 * Même mémorisation que le vivier d'attaques : le tri des formes est
 * identique pour tous les composants et parcourt 326 entrées, donc il
 * s'attache aux références des deux sources plutôt qu'à un `useMemo` par
 * instance.
 */
let cache: {
  formes: BattleForm[]
  parId: ReadonlyMap<number, PokemonSummary>
  parEspece: Map<number, BattleForm[]>
} | null = null

function trier(formes: BattleForm[], parId: ReadonlyMap<number, PokemonSummary>) {
  if (cache?.formes === formes && cache.parId === parId) return cache.parEspece

  const parEspece = formesJouables(formes, parId)
  cache = { formes, parId, parEspece }
  return parEspece
}

/**
 * Les formes alternatives jouables, indexées par espèce.
 *
 * L'index du dex est indispensable au tri — c'est en comparant à l'espèce
 * qu'on reconnaît une forme purement décorative — donc le hook attend qu'il
 * soit là avant de renvoyer quoi que ce soit.
 */
export function useBattleForms(parId: ReadonlyMap<number, PokemonSummary> | undefined) {
  const query = useQuery({
    queryKey: FORMS_QUERY_KEY,
    queryFn: async ({ signal }) =>
      normalizeBattleForms(await gql<RawFormsResponse>(FORMS_QUERY, undefined, signal)),
    staleTime: Infinity,
    gcTime: Infinity,
  })

  return {
    /**
     * `undefined` tant que la table n'est pas là. Le mode combat n'attend
     * pas après elle : sans formes, on joue les espèces par défaut.
     */
    parEspece: query.data && parId ? trier(query.data, parId) : undefined,
    isPending: query.isPending,
    isError: query.isError,
  }
}
