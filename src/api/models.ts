import type { StatName, TypeName } from '@/lib/pokemon-types'

/** Une entrée de la grille. Volontairement plate et sérialisable : c'est ce qui est mis en cache. */
export type PokemonSummary = {
  /** Numéro de Pokédex national. Sert aussi d'id de sprite (identiques pour les formes par défaut). */
  id: number
  /** Nom canonique anglais, ex. `charizard`. */
  slug: string
  /** Nom français affiché, ex. `Dracaufeu`. */
  name: string
  /** Catégorie, ex. `Pokémon Flamme`. */
  genus: string
  types: TypeName[]
  stats: Record<StatName, number>
  statTotal: number
  /** Décimètres. */
  height: number
  /** Hectogrammes. */
  weight: number
  baseExperience: number | null
  generation: number
  isLegendary: boolean
  isMythical: boolean
  isBaby: boolean
  captureRate: number
  evolutionChainId: number | null
  /** Nom français normalisé (sans accents ni ponctuation), pré-calculé pour la recherche. */
  nameKey: string
  /** Nom anglais normalisé, pour que « charizard » trouve Dracaufeu. */
  slugKey: string
}

export type EfficacyRow = {
  damage_factor: number
  damage_type_id: number
  target_type_id: number
}

export type PokedexIndexData = {
  pokemon: PokemonSummary[]
  efficacy: EfficacyRow[]
}

export type SpriteSet = {
  artwork: string | null
  artworkShiny: string | null
  home: string | null
  homeShiny: string | null
  showdown: string | null
  showdownShiny: string | null
  pixel: string | null
  pixelShiny: string | null
}

export type Ability = {
  slug: string
  name: string
  description: string | null
  isHidden: boolean
}

/** Une forme jouable : la forme par défaut, une Méga, une Gigamax, une variante régionale… */
export type PokemonForm = {
  id: number
  slug: string
  /** Libellé français de la forme, ex. `Méga-Dracaufeu X`. */
  name: string
  /** Étiquette courte pour le sélecteur, ex. `Méga X`. */
  shortName: string
  isDefault: boolean
  isMega: boolean
  isBattleOnly: boolean
  types: TypeName[]
  stats: Record<StatName, number>
  statTotal: number
  height: number
  weight: number
  baseExperience: number | null
  abilities: Ability[]
  sprites: SpriteSet
  cry: string | null
}

export type FlavorEntry = {
  text: string
  version: string | null
  /** `en` signale une description non traduite (gen 9 essentiellement). */
  lang: 'fr' | 'en'
}

export type EvolutionNode = {
  speciesId: number
  pokemonId: number
  name: string
  types: TypeName[]
  /** Conditions à remplir pour atteindre ce stade, déjà formatées en français. */
  conditions: string[]
  children: EvolutionNode[]
}

export type PokemonDetail = {
  id: number
  name: string
  slug: string
  genus: string
  generation: number
  isLegendary: boolean
  isMythical: boolean
  isBaby: boolean
  captureRate: number
  baseHappiness: number | null
  /** -1 = asexué, sinon proportion de femelles sur 8. */
  genderRate: number
  hatchCounter: number | null
  hasGenderDifferences: boolean
  eggGroups: string[]
  habitat: string | null
  shape: string | null
  growthRate: string | null
  entries: FlavorEntry[]
  forms: PokemonForm[]
  evolution: EvolutionNode[]
}

/* ------------------------------------------------------------------ *
 * Mode combat
 * ------------------------------------------------------------------ */

/** Physique tape sur la Défense, spéciale sur la Défense Spéciale. */
export type MoveCategory = 'physical' | 'special'

/** Une attaque du vivier de combat. Toujours offensive : `power` est garanti. */
export type Move = {
  id: number
  /** Nom français, ex. `Lance-Flammes`. */
  name: string
  type: TypeName
  power: number
  /** Pourcentage de réussite. `null` = ne rate jamais, comme Météores. */
  accuracy: number | null
  pp: number
  /** Positive = frappe avant les attaques ordinaires, comme Vive-Attaque (+1). */
  priority: number
  category: MoveCategory
}

/**
 * Les attaques apprenables, par identifiant de Pokémon — numéro de Pokédex
 * pour une espèce, identifiant de forme au-delà de 10000. Ne contient que
 * des identifiants : les attaques elles-mêmes vivent dans la table commune,
 * chargée une fois pour tout le jeu.
 */
export type Movesets = Record<number, number[]>

/**
 * Une forme alternative utilisable en combat. Volontairement plus légère
 * que `PokemonForm`, qui sert la fiche détail : le combat n'a besoin que de
 * ce qui change vraiment d'une forme à l'autre — les types, les statistiques
 * et l'identifiant qui adresse les sprites.
 */
export type BattleForm = {
  /** Identifiant du Pokémon-forme, ex. 10043. Adresse les sprites et les capacités. */
  id: number
  /** Numéro de Pokédex national de l'espèce, ex. 150. */
  speciesId: number
  /** Libellé complet et unique, ex. `Méga-Mewtwo X`. */
  name: string
  /** Étiquette courte pour le badge d'emplacement, ex. `Méga X`. */
  shortName: string
  isMega: boolean
  types: TypeName[]
  stats: Record<StatName, number>
  statTotal: number
}
