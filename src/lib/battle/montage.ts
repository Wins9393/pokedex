import type { BattleForm, Move, PokemonSummary } from '@/api/models'
import { choisirAttaques } from './moveset'
import { statsDeCombat } from './stats'
import type { Battler } from './types'

/**
 * Le montage d'un combattant, séparé des règles.
 *
 * Il faut le dex, le vivier d'attaques et la table des formes pour
 * fabriquer un `Battler` ; il ne faut rien de tout ça pour résoudre un
 * tour. La coupure n'est pas cosmétique : c'est elle qui permet à
 * l'arbitre en ligne d'embarquer `engine.ts` sans embarquer le Pokédex.
 */

/**
 * Monte un combattant. La forme, quand il y en a une, ne fait que se
 * substituer à l'espèce comme source de types, de statistiques et de
 * sprites : rien d'autre dans le moteur ne sait qu'elle existe.
 *
 * Les capacités, elles, sont fournies par l'appelant — voir `apprises` dans
 * `BattlePage`, qui réunit le vivier de l'espèce et celui de la forme.
 */
export function creerBattler(
  summary: PokemonSummary,
  forme: BattleForm | null,
  shiny: boolean,
  apprises: readonly number[],
  parId: ReadonlyMap<number, Move>,
): Battler {
  const types = forme?.types ?? summary.types
  const base = forme?.stats ?? summary.stats
  const stats = statsDeCombat(base)

  return {
    dexId: summary.id,
    spriteId: forme?.id ?? summary.id,
    shiny,
    name: forme?.name ?? summary.name,
    types,
    stats,
    hp: stats.hp,
    maxHp: stats.hp,
    moves: choisirAttaques(types, base, apprises, parId),
  }
}
