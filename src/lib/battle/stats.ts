import type { StatName } from '@/lib/pokemon-types'
import { STAT_ORDER } from '@/lib/pokemon-types'
import { NIVEAU } from './types'

/**
 * Les IV sont fixés au maximum et les EV à zéro pour tout le monde : c'est
 * le réglage qui rend deux exemplaires du même Pokémon rigoureusement
 * identiques, donc le combat dépendant du choix et non d'un tirage caché.
 */
const IV = 31

/**
 * Les PV suivent une formule différente des autres statistiques — d'où le
 * `+ NIVEAU + 10` au lieu du `+ 5`. Confondre les deux donne des barres de
 * vie deux fois trop courtes.
 *
 * Dracaufeu (base 78) → 153 PV au niveau 50.
 */
export const hpAuNiveau = (base: number) =>
  Math.floor(((2 * base + IV) * NIVEAU) / 100) + NIVEAU + 10

/** Dracaufeu (base 84 en Attaque) → 104 au niveau 50. */
export const statAuNiveau = (base: number) => Math.floor(((2 * base + IV) * NIVEAU) / 100) + 5

/** Convertit les statistiques de base du Pokédex en statistiques de combat. */
export function statsDeCombat(base: Record<StatName, number>): Record<StatName, number> {
  const stats = {} as Record<StatName, number>
  for (const key of STAT_ORDER) {
    stats[key] = key === 'hp' ? hpAuNiveau(base[key]) : statAuNiveau(base[key])
  }
  return stats
}
