import type { Move } from '@/api/models'
import type { StatName, TypeName } from '@/lib/pokemon-types'
import { NB_ATTAQUES } from './types'
import type { MoveSlot } from './types'

/**
 * Attaque de secours, comme dans les jeux. Certains Pokémon n'apprennent
 * aucune attaque du vivier — Magicarpe ne connaît que Trempette et des
 * attaques à puissance variable, toutes écartées — et doivent malgré tout
 * pouvoir agir.
 *
 * Son identifiant négatif la marque comme sans type : voir `estSansType`
 * dans `damage.ts`.
 */
export const LUTTE: Move = {
  id: -1,
  name: 'Lutte',
  type: 'normal',
  power: 50,
  accuracy: null,
  pp: 10,
  priority: 0,
  category: 'physical',
  // Lutte est un placage : `contact` dans l'API, donc une mêlée ici aussi.
  archetype: 'melee',
}

/**
 * Vraisemblance d'une attaque pour ce Pokémon : sa puissance corrigée par
 * sa précision, portée par la statistique offensive correspondante. Un
 * Pokémon à forte Attaque privilégiera donc naturellement les attaques
 * physiques, sans qu'on ait à le coder comme une règle à part.
 */
function score(move: Move, types: readonly TypeName[], base: Record<StatName, number>) {
  const puissanceUtile = move.power * ((move.accuracy ?? 100) / 100)
  const offensive = move.category === 'physical' ? base.attack : base['special-attack']
  const stab = types.includes(move.type) ? 1.5 : 1
  return puissanceUtile * offensive * stab
}

/**
 * Compose les quatre attaques d'un Pokémon. Volontairement **déterministe** :
 * deux joueurs qui choisissent le même Pokémon obtiennent le même jeu
 * d'attaques, et un combat rejoué donne le même résultat.
 *
 * L'ordre des priorités reproduit la façon dont on construit une équipe :
 * d'abord jouer son type, ensuite couvrir ses angles morts.
 */
export function choisirAttaques(
  types: readonly TypeName[],
  base: Record<StatName, number>,
  apprises: readonly number[],
  parId: ReadonlyMap<number, Move>,
): MoveSlot[] {
  const candidats = apprises
    .map((id) => parId.get(id))
    .filter((move): move is Move => move !== undefined)
    // Départage par identifiant : sans lui, deux attaques de score égal
    // pourraient s'ordonner différemment d'une exécution à l'autre.
    .sort((a, b) => score(b, types, base) - score(a, types, base) || a.id - b.id)

  const retenues: Move[] = []
  const typesRetenus = new Set<TypeName>()

  const ajouter = (move: Move) => {
    retenues.push(move)
    typesRetenus.add(move.type)
  }

  // 1. La meilleure attaque STAB de chaque type du Pokémon.
  for (const type of types) {
    if (retenues.length >= NB_ATTAQUES) break
    const meilleure = candidats.find((move) => move.type === type && !retenues.includes(move))
    if (meilleure) ajouter(meilleure)
  }

  // 2. De la couverture : des types encore absents du jeu d'attaques.
  for (const move of candidats) {
    if (retenues.length >= NB_ATTAQUES) break
    if (retenues.includes(move) || typesRetenus.has(move.type)) continue
    ajouter(move)
  }

  // 3. Les places restantes vont aux meilleures attaques, type indifférent.
  for (const move of candidats) {
    if (retenues.length >= NB_ATTAQUES) break
    if (!retenues.includes(move)) ajouter(move)
  }

  const finales = retenues.length > 0 ? retenues : [LUTTE]
  return finales.map((move) => ({ move, pp: move.pp, maxPp: move.pp }))
}
