import type { Move } from '@/api/models'
import type { TypeName } from '@/lib/pokemon-types'
import type { TypeChart } from '@/lib/type-chart'
import { randInt } from './rng'
import type { Rng } from './rng'
import { NIVEAU } from './types'
import type { Battler } from './types'

/** Un coup sur 24, comme depuis la 7e génération. */
const CHANCE_CRITIQUE = 1 / 24
const MULTIPLICATEUR_CRITIQUE = 1.5

/** Bonus quand l'attaque est du même type que son lanceur. */
const STAB = 1.5

/**
 * Les attaques de secours (identifiant négatif, voir `LUTTE`) sont sans
 * type : elles ignorent la table d'efficacité. Sans cette exception, un
 * Magicarpe réduit à Lutte serait incapable de blesser un Spectre, et le
 * combat ne pourrait plus se terminer.
 */
const estSansType = (move: Move) => move.id < 0

export function efficaciteContre(
  chart: TypeChart,
  move: Move,
  cibles: readonly TypeName[],
): number {
  if (estSansType(move)) return 1
  return cibles.reduce((total, cible) => total * (chart[move.type]?.[cible] ?? 1), 1)
}

export type Frappe = {
  /** Faux uniquement si l'attaque a raté sa cible. */
  touche: boolean
  degats: number
  critique: boolean
  /** 0 = immunité, 0,25 à 4 sinon. */
  efficacite: number
}

/**
 * Formule de dégâts de la 5e génération et suivantes. Les arrondis à
 * l'entier inférieur en cours de route ne sont pas décoratifs : les
 * supprimer décale le résultat de plusieurs points de vie.
 *
 * L'ordre des multiplicateurs compte aussi — critique, puis aléa, puis
 * STAB, puis efficacité.
 */
export function resoudreFrappe(
  attaquant: Battler,
  defenseur: Battler,
  move: Move,
  chart: TypeChart,
  rng: Rng,
): Frappe {
  const efficacite = efficaciteContre(chart, move, defenseur.types)

  // Une immunité s'annonce avant le jet de précision : « Cela n'affecte
  // pas… » se produit même sur une attaque qui aurait raté.
  if (efficacite === 0) {
    return { touche: true, degats: 0, critique: false, efficacite: 0 }
  }

  if (move.accuracy !== null && rng() * 100 >= move.accuracy) {
    return { touche: false, degats: 0, critique: false, efficacite }
  }

  const physique = move.category === 'physical'
  const offensive = physique ? attaquant.stats.attack : attaquant.stats['special-attack']
  const defensive = physique ? defenseur.stats.defense : defenseur.stats['special-defense']

  const facteurNiveau = Math.floor((2 * NIVEAU) / 5) + 2
  const brut = Math.floor((facteurNiveau * move.power * offensive) / defensive)
  let degats = Math.floor(brut / 50) + 2

  const critique = rng() < CHANCE_CRITIQUE
  if (critique) degats = Math.floor(degats * MULTIPLICATEUR_CRITIQUE)

  degats = Math.floor((degats * (85 + randInt(rng, 16))) / 100)
  if (!estSansType(move) && attaquant.types.includes(move.type)) {
    degats = Math.floor(degats * STAB)
  }
  degats = Math.floor(degats * efficacite)

  // Une attaque qui touche retire toujours au moins un point de vie.
  return { touche: true, degats: Math.max(1, degats), critique, efficacite }
}
