import type { EfficacyRow } from '@/api/models'
import { TYPE_BY_ID, TYPE_ORDER } from './pokemon-types'
import type { TypeName } from './pokemon-types'

/** Multiplicateur de dégâts : attaquant → défenseur. */
export type TypeChart = Record<TypeName, Record<TypeName, number>>

/**
 * La matrice arrive de l'API sous forme de 324 lignes plates avec des
 * facteurs en centièmes (200 = ×2). On la déplie une fois pour toutes.
 */
export function buildTypeChart(rows: EfficacyRow[]): TypeChart {
  const chart = {} as TypeChart

  for (const attacker of TYPE_ORDER) {
    chart[attacker] = {} as Record<TypeName, number>
    for (const defender of TYPE_ORDER) chart[attacker][defender] = 1
  }

  for (const row of rows) {
    const attacker = TYPE_BY_ID[row.damage_type_id]
    const defender = TYPE_BY_ID[row.target_type_id]
    if (attacker && defender) chart[attacker][defender] = row.damage_factor / 100
  }

  return chart
}

export type Matchup = { type: TypeName; multiplier: number }

/**
 * Sur un double type, les multiplicateurs se multiplient : Roche est ×2
 * contre Feu et ×2 contre Vol, donc ×4 contre Dracaufeu.
 */
export function computeMatchups(chart: TypeChart, defenders: readonly TypeName[]): Matchup[] {
  return TYPE_ORDER.map((attacker) => ({
    type: attacker,
    multiplier: defenders.reduce((total, defender) => total * (chart[attacker][defender] ?? 1), 1),
  }))
}

/** Regroupe les types par multiplicateur, du plus dangereux au plus inoffensif. */
export function groupMatchups(matchups: Matchup[]) {
  const buckets = new Map<number, TypeName[]>()

  for (const { type, multiplier } of matchups) {
    if (multiplier === 1) continue
    const bucket = buckets.get(multiplier)
    if (bucket) bucket.push(type)
    else buckets.set(multiplier, [type])
  }

  return [...buckets.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([multiplier, types]) => ({ multiplier, types }))
}

export function formatMultiplier(multiplier: number): string {
  if (multiplier === 0) return '×0'
  if (multiplier === 0.25) return '×¼'
  if (multiplier === 0.5) return '×½'
  return `×${multiplier}`
}

export function multiplierTone(multiplier: number): 'danger' | 'warn' | 'good' | 'immune' {
  if (multiplier === 0) return 'immune'
  if (multiplier >= 4) return 'danger'
  if (multiplier > 1) return 'warn'
  return 'good'
}
