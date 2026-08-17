import type { MoveCategory } from '@/api/models'

/**
 * Le geste d'une attaque, tel qu'il sera joué à l'écran.
 *
 * PokéAPI n'expose aucun sprite d'attaque — depuis la 6G les animations des
 * jeux sont des scripts et des effets 3D, il n'y a rien à extraire. En
 * revanche la base décrit la **nature physique** de chaque coup, par des
 * drapeaux prévus à l'origine pour des règles de jeu : `contact` sert à
 * Peau Dure, `ballistics` à Pare-Balles, `sound` à Anti-Bruit. Détournés,
 * ils disent exactement ce qu'il faut dessiner.
 *
 * C'est donc une classification pilotée par les données, sans liste de noms
 * à maintenir — comme le filtre du vivier et `formesJouables`.
 */
export type Archetype = 'melee' | 'poing' | 'morsure' | 'projectile' | 'faisceau' | 'onde'

/**
 * Identifiants PokéAPI des drapeaux `moveattribute` retenus. Les 15 autres
 * (`mirror`, `protect`, `snatch`…) décrivent des interactions de règles et
 * ne disent rien du geste ; les demander alourdirait la requête sans rien
 * apporter. Voir `MOVES_QUERY`, qui filtre sur cette liste côté serveur.
 */
export const DRAPEAUX_GESTE = {
  contact: 1,
  punch: 8,
  sound: 9,
  bite: 16,
  pulse: 17,
  ballistics: 18,
} as const

/**
 * L'ordre compte : il va du geste le plus spécifique au plus générique.
 * Dynamopoing est `contact` **et** `punch` — c'est le poing qu'on veut
 * voir. Reste le cas des attaques sans aucun drapeau, majoritaire : la
 * classe de dégâts tranche seule, une spéciale à distance étant un
 * faisceau et une physique à distance un projectile.
 */
export function archetypeDe(drapeaux: ReadonlySet<number>, category: MoveCategory): Archetype {
  const { contact, punch, sound, bite, pulse, ballistics } = DRAPEAUX_GESTE

  if (drapeaux.has(sound) || drapeaux.has(pulse)) return 'onde'
  if (drapeaux.has(punch)) return 'poing'
  if (drapeaux.has(bite)) return 'morsure'
  if (drapeaux.has(contact)) return 'melee'
  if (drapeaux.has(ballistics)) return 'projectile'

  return category === 'special' ? 'faisceau' : 'projectile'
}

/** Vrai si l'attaquant doit se jeter sur sa cible plutôt que lui envoyer quelque chose. */
export const estAuContact = (archetype: Archetype) =>
  archetype === 'melee' || archetype === 'poing' || archetype === 'morsure'
