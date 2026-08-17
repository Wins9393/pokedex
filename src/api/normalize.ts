/**
 * Transforme les réponses GraphQL (très imbriquées) en modèles plats.
 * C'est le seul endroit du code qui connaît la forme brute de l'API.
 */

import type {
  Ability,
  BattleForm,
  EfficacyRow,
  EvolutionNode,
  FlavorEntry,
  Move,
  Movesets,
  PokedexIndexData,
  PokemonDetail,
  PokemonForm,
  PokemonSummary,
} from './models'
import { STAT_ORDER, TYPE_ORDER } from '@/lib/pokemon-types'
import type { StatName, TypeName } from '@/lib/pokemon-types'
import { capitalize, cleanFlavorText, formatEggGroup, normalizeText, prettifySlug } from '@/lib/format'
import { parseSprites } from '@/lib/sprites'

/* ------------------------------------------------------------------ *
 * Formes brutes renvoyées par l'API
 * ------------------------------------------------------------------ */

type RawName = { name: string }
type RawTypeLink = { type: RawName }
type RawStatLink = { base_stat: number; stat: RawName }

type RawIndexSpecies = {
  id: number
  generation_id: number
  is_legendary: boolean
  is_mythical: boolean
  is_baby: boolean
  capture_rate: number
  evolution_chain_id: number | null
  names: { name: string; genus: string }[]
  forms: {
    id: number
    name: string
    height: number | null
    weight: number | null
    base_experience: number | null
    types: RawTypeLink[]
    stats: RawStatLink[]
  }[]
}

export type RawIndexResponse = {
  species: RawIndexSpecies[]
  efficacy: EfficacyRow[]
}

type RawEvolutionRow = {
  min_level: number | null
  min_happiness: number | null
  min_beauty: number | null
  min_affection: number | null
  time_of_day: string | null
  needs_overworld_rain: boolean | null
  turn_upside_down: boolean | null
  relative_physical_stats: number | null
  evolutiontrigger: RawName | null
  item: { itemnames: RawName[] } | null
  ItemByHeldItemId: { itemnames: RawName[] } | null
  move: { movenames: RawName[] } | null
  type: RawName | null
  location: { locationnames: RawName[] } | null
  gender: RawName | null
  PokemonspecyByTradeSpeciesId: { pokemonspeciesnames: RawName[] } | null
}

type RawDetailSpecies = {
  id: number
  generation_id: number
  capture_rate: number
  base_happiness: number | null
  gender_rate: number
  hatch_counter: number | null
  is_legendary: boolean
  is_mythical: boolean
  is_baby: boolean
  has_gender_differences: boolean
  names: { name: string; genus: string }[]
  frText: { flavor_text: string; version: { versionnames: RawName[] } | null }[]
  enText: { flavor_text: string; version: { versionnames: RawName[] } | null }[]
  eggGroups: { egggroup: { name: string; egggroupnames: RawName[] } }[]
  habitat: { pokemonhabitatnames: RawName[] } | null
  shape: { pokemonshapenames: RawName[] } | null
  growthrate: RawName | null
  chain: {
    id: number
    links: {
      id: number
      evolves_from_species_id: number | null
      names: RawName[]
      default: { id: number; types: RawTypeLink[] }[]
      evolutions: RawEvolutionRow[]
    }[]
  } | null
  variants: {
    id: number
    name: string
    is_default: boolean
    height: number | null
    weight: number | null
    base_experience: number | null
    pokemoncries: { cries: { latest?: string | null; legacy?: string | null } | null }[]
    pokemonsprites: { sprites: unknown }[]
    pokemonforms: {
      form_name: string | null
      is_mega: boolean
      is_battle_only: boolean
      pokemonformnames: { name: string; pokemon_name: string }[]
    }[]
    types: RawTypeLink[]
    stats: RawStatLink[]
    abilities: {
      is_hidden: boolean
      ability: {
        name: string
        abilitynames: RawName[]
        abilityflavortexts: { flavor_text: string }[]
      } | null
    }[]
  }[]
}

export type RawDetailResponse = { species: RawDetailSpecies[] }

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

const KNOWN_TYPES = new Set<string>(TYPE_ORDER)

const toTypes = (links: RawTypeLink[]): TypeName[] =>
  links.map((l) => l.type.name).filter((n): n is TypeName => KNOWN_TYPES.has(n))

const EMPTY_STATS = (): Record<StatName, number> =>
  Object.fromEntries(STAT_ORDER.map((s) => [s, 0])) as Record<StatName, number>

function toStats(links: RawStatLink[]): Record<StatName, number> {
  const stats = EMPTY_STATS()
  for (const link of links) {
    const key = link.stat.name as StatName
    if (key in stats) stats[key] = link.base_stat
  }
  return stats
}

const sumStats = (stats: Record<StatName, number>) =>
  STAT_ORDER.reduce((total, key) => total + stats[key], 0)

/* ------------------------------------------------------------------ *
 * Index
 * ------------------------------------------------------------------ */

export function normalizeIndex(raw: RawIndexResponse): PokedexIndexData {
  const pokemon: PokemonSummary[] = []

  for (const species of raw.species) {
    const form = species.forms[0]
    if (!form) continue

    const stats = toStats(form.stats)
    const name = species.names[0]?.name ?? prettifySlug(form.name)

    pokemon.push({
      id: species.id,
      slug: form.name,
      name,
      genus: species.names[0]?.genus ?? '',
      types: toTypes(form.types),
      stats,
      statTotal: sumStats(stats),
      height: form.height ?? 0,
      weight: form.weight ?? 0,
      baseExperience: form.base_experience,
      generation: species.generation_id,
      isLegendary: species.is_legendary,
      isMythical: species.is_mythical,
      isBaby: species.is_baby,
      captureRate: species.capture_rate,
      evolutionChainId: species.evolution_chain_id,
      // Normalisé une seule fois au chargement : la recherche n'a plus
      // qu'à comparer du texte déjà propre, sur 1025 entrées, à chaque
      // frappe.
      nameKey: normalizeText(name),
      slugKey: normalizeText(form.name),
    })
  }

  return { pokemon, efficacy: raw.efficacy }
}

/* ------------------------------------------------------------------ *
 * Conditions d'évolution
 * ------------------------------------------------------------------ */

const TIME_OF_DAY: Record<string, string> = {
  day: 'le jour',
  night: 'la nuit',
  dusk: 'au crépuscule',
}

const TRIGGER_LABELS: Record<string, string> = {
  trade: 'Échange',
  shed: 'Niveau 20 avec une place et une Poké Ball libres',
  spin: 'Tourner sur soi-même',
  'tower-of-darkness': 'Tour des Ténèbres',
  'tower-of-waters': 'Tour de l’Eau',
  'three-critical-hits': '3 coups critiques dans un combat',
  'take-damage': 'Subir 49 dégâts sans être K.O.',
  'agile-style-move': '20 capacités en style Agile',
  'strong-style-move': '20 capacités en style Puissant',
  'recoil-damage': 'Subir des dégâts de recul',
  other: 'Méthode spéciale',
}

/** Met en français la condition à remplir pour obtenir une évolution. */
function describeEvolution(row: RawEvolutionRow): string {
  const trigger = row.evolutiontrigger?.name ?? ''
  const itemName = row.item?.itemnames[0]?.name
  const parts: string[] = []

  if (trigger === 'use-item' && itemName) {
    parts.push(itemName)
  } else if (trigger === 'level-up') {
    parts.push(row.min_level ? `Niveau ${row.min_level}` : 'Montée de niveau')
  } else if (TRIGGER_LABELS[trigger]) {
    parts.push(TRIGGER_LABELS[trigger])
  } else if (itemName) {
    parts.push(itemName)
  } else {
    parts.push('Évolution')
  }

  const conditions: string[] = []
  const tradeWith = row.PokemonspecyByTradeSpeciesId?.pokemonspeciesnames[0]?.name
  if (tradeWith) conditions.push(`contre ${tradeWith}`)

  const heldItem = row.ItemByHeldItemId?.itemnames[0]?.name
  if (heldItem) conditions.push(`en tenant ${heldItem}`)

  if (row.min_happiness) conditions.push(`bonheur ≥ ${row.min_happiness}`)
  if (row.min_beauty) conditions.push(`beauté ≥ ${row.min_beauty}`)
  if (row.min_affection) conditions.push(`affection ≥ ${row.min_affection}`)

  const move = row.move?.movenames[0]?.name
  if (move) conditions.push(`en connaissant ${move}`)
  if (row.type) conditions.push(`avec une capacité ${row.type.name}`)

  const location = row.location?.locationnames[0]?.name
  if (location) conditions.push(`à ${location}`)

  if (row.time_of_day) {
    const label = TIME_OF_DAY[row.time_of_day]
    if (label) conditions.push(label)
  }

  if (row.gender?.name === 'female') conditions.push('♀ uniquement')
  if (row.gender?.name === 'male') conditions.push('♂ uniquement')

  if (row.relative_physical_stats === 1) conditions.push('Attaque > Défense')
  if (row.relative_physical_stats === 0) conditions.push('Attaque = Défense')
  if (row.relative_physical_stats === -1) conditions.push('Attaque < Défense')

  if (row.needs_overworld_rain) conditions.push('sous la pluie')
  if (row.turn_upside_down) conditions.push('console retournée')

  return conditions.length ? `${parts[0]} (${conditions.join(', ')})` : parts[0]
}

/** Reconstruit l'arbre d'évolution à partir de la liste plate des espèces de la chaîne. */
function buildEvolutionTree(chain: RawDetailSpecies['chain']): EvolutionNode[] {
  if (!chain) return []

  const nodes = new Map<number, EvolutionNode>()
  for (const link of chain.links) {
    nodes.set(link.id, {
      speciesId: link.id,
      pokemonId: link.default[0]?.id ?? link.id,
      name: link.names[0]?.name ?? `#${link.id}`,
      types: toTypes(link.default[0]?.types ?? []),
      // Plusieurs lignes d'évolution mènent parfois au même libellé
      // (Raichu et Raichu d'Alola s'obtiennent tous deux à la Pierre
      // Foudre) : on ne l'affiche qu'une fois.
      conditions: [...new Set(link.evolutions.map(describeEvolution))],
      children: [],
    })
  }

  const roots: EvolutionNode[] = []
  for (const link of chain.links) {
    const node = nodes.get(link.id)
    if (!node) continue
    const parent =
      link.evolves_from_species_id != null ? nodes.get(link.evolves_from_species_id) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }

  return roots
}

/* ------------------------------------------------------------------ *
 * Formes
 * ------------------------------------------------------------------ */

const FORM_SHORT_LABELS: Record<string, string> = {
  mega: 'Méga',
  'mega-x': 'Méga X',
  'mega-y': 'Méga Y',
  gmax: 'Gigamax',
  primal: 'Primo',
  alola: 'Alola',
  galar: 'Galar',
  hisui: 'Hisui',
  paldea: 'Paldea',
  origin: 'Originelle',
  therian: 'Totémique',
  sky: 'Ciel',
  crowned: 'Couronnée',
  eternamax: 'Éternamax',
  starter: 'Partenaire',
}

/**
 * Étiquette courte d'une forme, pour les sélecteurs et les badges. Les
 * libellés maison priment sur ceux de l'API, qui sont des phrases (« Forme
 * d'Alola ») là où il faut un mot.
 */
function shortFormLabel(
  formSlug: string,
  label: { name: string } | undefined,
  fallbackSlug: string,
) {
  return (
    FORM_SHORT_LABELS[formSlug] ??
    label?.name?.replace(/^Forme\s+/i, '') ??
    (formSlug ? prettifySlug(formSlug) : prettifySlug(fallbackSlug))
  )
}

function normalizeForm(
  variant: RawDetailSpecies['variants'][number],
  speciesName: string,
): PokemonForm {
  const meta = variant.pokemonforms[0]
  const formSlug = meta?.form_name ?? ''
  const label = meta?.pokemonformnames[0]

  const fullName = variant.is_default
    ? speciesName
    : (label?.pokemon_name || label?.name || prettifySlug(variant.name))

  const shortName = variant.is_default
    ? 'Normale'
    : shortFormLabel(formSlug, label, variant.name)

  const stats = toStats(variant.stats)

  const abilities: Ability[] = variant.abilities
    .filter((entry) => entry.ability)
    .map((entry) => ({
      slug: entry.ability!.name,
      name: entry.ability!.abilitynames[0]?.name ?? prettifySlug(entry.ability!.name),
      description: entry.ability!.abilityflavortexts[0]
        ? cleanFlavorText(entry.ability!.abilityflavortexts[0].flavor_text)
        : null,
      isHidden: entry.is_hidden,
    }))

  return {
    id: variant.id,
    slug: variant.name,
    name: fullName,
    shortName,
    isDefault: variant.is_default,
    isMega: meta?.is_mega ?? false,
    isBattleOnly: meta?.is_battle_only ?? false,
    types: toTypes(variant.types),
    stats,
    statTotal: sumStats(stats),
    height: variant.height ?? 0,
    weight: variant.weight ?? 0,
    baseExperience: variant.base_experience,
    abilities,
    sprites: parseSprites(variant.pokemonsprites[0]?.sprites, variant.id),
    cry: variant.pokemoncries[0]?.cries?.latest ?? null,
  }
}

/* ------------------------------------------------------------------ *
 * Fiche complète
 * ------------------------------------------------------------------ */

function collectEntries(species: RawDetailSpecies): FlavorEntry[] {
  const source = species.frText.length ? species.frText : species.enText
  const lang: FlavorEntry['lang'] = species.frText.length ? 'fr' : 'en'

  // Une entrée par jeu : c'est le jeu qui sert de clé dans le sélecteur
  // de la fiche. Deux versions partageant le même texte restent donc deux
  // choix distincts, mais un même jeu n'apparaît jamais deux fois.
  const seen = new Set<string>()
  const entries: FlavorEntry[] = []

  for (const item of source) {
    const text = cleanFlavorText(item.flavor_text)
    const version = item.version?.versionnames[0]?.name ?? null
    const key = version ?? text
    if (!text || seen.has(key)) continue
    seen.add(key)
    entries.push({ text, version, lang })
  }

  return entries
}

/**
 * La requête renvoie toujours une liste, qu'on ait demandé une fiche ou
 * vingt : le téléchargement intégral s'en sert pour ramener le dex par lots.
 */
export function normalizeDetails(raw: RawDetailResponse): PokemonDetail[] {
  return raw.species.map(normalizeSpecies)
}

export function normalizeDetail(raw: RawDetailResponse): PokemonDetail | null {
  const species = raw.species[0]
  return species ? normalizeSpecies(species) : null
}

function normalizeSpecies(species: RawDetailSpecies): PokemonDetail {
  const name = species.names[0]?.name ?? `#${species.id}`

  // La forme par défaut d'abord, puis les autres par identifiant croissant.
  const forms = species.variants
    .map((variant) => normalizeForm(variant, name))
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.id - b.id)

  return {
    id: species.id,
    name,
    slug: forms[0]?.slug ?? '',
    genus: species.names[0]?.genus ?? '',
    generation: species.generation_id,
    isLegendary: species.is_legendary,
    isMythical: species.is_mythical,
    isBaby: species.is_baby,
    captureRate: species.capture_rate,
    baseHappiness: species.base_happiness,
    genderRate: species.gender_rate,
    hatchCounter: species.hatch_counter,
    hasGenderDifferences: species.has_gender_differences,
    eggGroups: species.eggGroups.map((group) =>
      formatEggGroup(group.egggroup.name, group.egggroup.egggroupnames[0]?.name),
    ),
    habitat: species.habitat?.pokemonhabitatnames[0]
      ? capitalize(species.habitat.pokemonhabitatnames[0].name)
      : null,
    shape: species.shape?.pokemonshapenames[0]
      ? capitalize(species.shape.pokemonshapenames[0].name)
      : null,
    growthRate: species.growthrate?.name ?? null,
    entries: collectEntries(species),
    forms,
    evolution: buildEvolutionTree(species.chain),
  }
}

/* ------------------------------------------------------------------ *
 * Mode combat
 * ------------------------------------------------------------------ */

type RawMove = {
  id: number
  power: number
  accuracy: number | null
  pp: number
  priority: number
  type: RawName
  movedamageclass: RawName
  movenames: RawName[]
}

export type RawMovesResponse = { move: RawMove[] }

export type RawMovesetsResponse = {
  pokemon: { id: number; moves: { move_id: number }[] }[]
}

/**
 * La requête filtre déjà sur les attaques offensives, mais rien ne garantit
 * côté types qu'une ligne soit exploitable : on écarte ici les rares
 * enregistrements dont le type ou la classe sortiraient du référentiel,
 * plutôt que de laisser un `undefined` traverser jusqu'au calcul de dégâts.
 */
export function normalizeMoves(raw: RawMovesResponse): Move[] {
  const moves: Move[] = []

  for (const move of raw.move) {
    const type = move.type.name
    const category = move.movedamageclass.name
    const name = move.movenames[0]?.name

    if (!name || !KNOWN_TYPES.has(type)) continue
    if (category !== 'physical' && category !== 'special') continue

    moves.push({
      id: move.id,
      name,
      type: type as TypeName,
      power: move.power,
      accuracy: move.accuracy,
      pp: move.pp,
      priority: move.priority,
      category,
    })
  }

  return moves
}

export function normalizeMovesets(raw: RawMovesetsResponse): Movesets {
  const movesets: Movesets = {}
  for (const entry of raw.pokemon) {
    movesets[entry.id] = entry.moves.map((link) => link.move_id)
  }
  return movesets
}

type RawBattleForm = {
  id: number
  speciesId: number
  types: RawTypeLink[]
  stats: RawStatLink[]
  form: {
    form_name: string | null
    is_mega: boolean
    names: { name: string; pokemon_name: string }[]
  }[]
}

export type RawFormsResponse = { pokemon: RawBattleForm[] }

/**
 * Traduit les formes brutes sans rien trier : le choix de ce qui est
 * jouable est une règle de jeu, pas une règle de données, et vit dans
 * `lib/battle/forms.ts`. Garder la table complète en cache permet aussi de
 * faire évoluer cette règle sans re-télécharger quoi que ce soit.
 */
export function normalizeBattleForms(raw: RawFormsResponse): BattleForm[] {
  const formes: BattleForm[] = []

  for (const entry of raw.pokemon) {
    const meta = entry.form[0]
    const label = meta?.names[0]
    const formSlug = meta?.form_name ?? ''
    const stats = toStats(entry.stats)

    formes.push({
      id: entry.id,
      speciesId: entry.speciesId,
      name: label?.pokemon_name || label?.name || prettifySlug(formSlug),
      shortName: shortFormLabel(formSlug, label, formSlug),
      isMega: meta?.is_mega ?? false,
      types: toTypes(entry.types),
      stats,
      statTotal: sumStats(stats),
    })
  }

  return formes
}
