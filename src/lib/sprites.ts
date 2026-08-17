import type { SpriteSet } from '@/api/models'

const SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon'
const CRIES = 'https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon/latest'

/**
 * Pour la grille, les URLs se déduisent du numéro : les 1025 formes par
 * défaut ont toutes un artwork officiel, donc aucune requête API n'est
 * nécessaire pour afficher un Pokémon.
 */
export const artworkUrl = (id: number, shiny = false) =>
  `${SPRITES}/other/official-artwork/${shiny ? 'shiny/' : ''}${id}.png`

export const showdownUrl = (id: number, shiny = false) =>
  `${SPRITES}/other/showdown/${shiny ? 'shiny/' : ''}${id}.gif`

export const pixelUrl = (id: number, shiny = false) =>
  `${SPRITES}/${shiny ? 'shiny/' : ''}${id}.png`

export const homeUrl = (id: number, shiny = false) =>
  `${SPRITES}/other/home/${shiny ? 'shiny/' : ''}${id}.png`

export const cryUrl = (id: number) => `${CRIES}/${id}.ogg`

/**
 * Sprite de dos, pour la vue de combat où le Pokémon du joueur est vu de
 * derrière. Le jeu « Showdown » en fournit un animé pour presque tout le
 * dex, mais il manque sur les tout derniers numéros (Pêchaminus, 1025) —
 * d'où le repli, lui complet, sur le sprite pixel.
 *
 * Le chromatique ne coûte rien : partout où la version normale existe, la
 * chromatique existe aussi, sans une exception. Vérifié sur les 1025
 * espèces (1004 sprites Showdown de dos, 1004 en chromatique) comme sur les
 * 326 formes (264 et 264).
 */
export const showdownBackUrl = (id: number, shiny = false) =>
  `${SPRITES}/other/showdown/back/${shiny ? 'shiny/' : ''}${id}.gif`

export const pixelBackUrl = (id: number, shiny = false) =>
  `${SPRITES}/back/${shiny ? 'shiny/' : ''}${id}.png`

/**
 * Derniers recours, communs à toutes les vues : des rendus haute définition
 * qui n'existent **que de face**. C'est ce qui garantit qu'aucun combattant
 * ne finisse sur un cadre vide — l'illustration officielle couvre 1243 des
 * 1244 combattants (219 formes jouables et 1025 espèces), le rendu HOME
 * 1242, et **leur réunion les 1244**, sans une exception.
 *
 * L'illustration passe avant HOME parce que c'est elle que le téléchargement
 * hors ligne met en cache : la préférer évite un aller-retour perdu quand le
 * réseau n'est plus là.
 */
const rendus = (id: number, shiny: boolean) => [
  ...(shiny ? [artworkUrl(id, true), homeUrl(id, true)] : []),
  artworkUrl(id),
  homeUrl(id),
]

/**
 * Chaîne d'affichage d'une vignette, du plus beau au plus sûr, avec repli
 * final sur les couleurs normales.
 */
export const vignetteSources = (id: number, shiny = false) => [
  ...new Set([
    ...(shiny ? [artworkUrl(id, true), homeUrl(id, true), showdownUrl(id, true), pixelUrl(id, true)] : []),
    artworkUrl(id),
    homeUrl(id),
    showdownUrl(id),
    pixelUrl(id),
  ]),
]

/**
 * Les deux chaînes de l'arène, du sprite de jeu au rendu de secours.
 *
 * Elles descendent d'abord dans les sprites du jeu — animés, puis pixel —
 * qui seuls donnent le bon angle de vue. Les 1244 combattants s'y arrêtent,
 * sauf **un** : Méga-Zygarde, forme de Legends Z-A dont PokéAPI n'a ni
 * sprite animé ni sprite pixel, ni de face ni de dos. Pour lui, et pour
 * toutes les formes récentes qui suivront, la chaîne se termine sur un
 * rendu de face : le Pokémon est alors vu du mauvais angle, mais c'est le
 * bon Pokémon plutôt qu'un cadre vide.
 *
 * Le chromatique passe en premier à chaque palier plutôt qu'une seule fois
 * en tête : mieux vaut un sprite pixel chromatique que le sprite animé
 * normal, sans quoi la couleur choisie disparaîtrait en silence.
 */
export const spritesDeDos = (id: number, shiny: boolean) => [
  ...new Set([
    ...(shiny ? [showdownBackUrl(id, true), pixelBackUrl(id, true)] : []),
    showdownBackUrl(id),
    pixelBackUrl(id),
    ...rendus(id, shiny),
  ]),
]

/*
 * La vue de face descend elle aussi jusqu'au sprite pixel avant les rendus.
 * Sans lui, les 61 combattants sans sprite animé apparaissaient en pixel
 * art dans le camp du joueur et en illustration lissée dans celui d'en
 * face : le même Pokémon n'avait pas le même rendu selon le côté du terrain.
 */
export const spritesDeFace = (id: number, shiny: boolean) => [
  ...new Set([
    ...(shiny ? [showdownUrl(id, true), pixelUrl(id, true)] : []),
    showdownUrl(id),
    pixelUrl(id),
    ...rendus(id, shiny),
  ]),
]

/**
 * Vrai pour les images qui doivent rester lissées : les rendus haute
 * définition. Tout le reste est du pixel art, à afficher en pixels nets.
 */
export const estUnRendu = (url: string) =>
  url.includes('/other/official-artwork/') || url.includes('/other/home/')

/** Sprite JSON renvoyé par PokéAPI (structure identique à celle du REST). */
type RawSprites = {
  front_default?: string | null
  front_shiny?: string | null
  other?: {
    'official-artwork'?: { front_default?: string | null; front_shiny?: string | null } | null
    home?: { front_default?: string | null; front_shiny?: string | null } | null
    showdown?: { front_default?: string | null; front_shiny?: string | null } | null
  } | null
}

export function parseSprites(raw: unknown, id: number): SpriteSet {
  const s = (raw ?? {}) as RawSprites
  const other = s.other ?? {}
  const art = other['official-artwork'] ?? {}
  const home = other.home ?? {}
  const showdown = other.showdown ?? {}

  return {
    artwork: art.front_default ?? null,
    artworkShiny: art.front_shiny ?? null,
    home: home.front_default ?? null,
    homeShiny: home.front_shiny ?? null,
    showdown: showdown.front_default ?? null,
    showdownShiny: showdown.front_shiny ?? null,
    pixel: s.front_default ?? `${SPRITES}/${id}.png`,
    pixelShiny: s.front_shiny ?? null,
  }
}

/**
 * Toutes les formes n'ont pas d'artwork chromatique (Évoli Partenaire par
 * exemple). On dégrade proprement plutôt que d'afficher une image cassée.
 */
export function bestImage(sprites: SpriteSet, shiny: boolean): string | null {
  const chain = shiny
    ? [sprites.artworkShiny, sprites.homeShiny, sprites.showdownShiny, sprites.pixelShiny]
    : []
  return (
    chain.find(Boolean) ??
    sprites.artwork ??
    sprites.home ??
    sprites.showdown ??
    sprites.pixel ??
    null
  )
}

/** Vrai si la forme possède réellement une déclinaison chromatique. */
export const hasShiny = (sprites: SpriteSet) =>
  Boolean(sprites.artworkShiny || sprites.homeShiny || sprites.showdownShiny || sprites.pixelShiny)

/**
 * Sprite animé (jeu « Showdown »). Couvre la quasi-totalité du dex, y
 * compris les Méga et Gigamax, mais manque pour quelques Pokémon très
 * récents — d'où le repli sur la version normale puis sur `null`.
 */
export const animatedImage = (sprites: SpriteSet, shiny: boolean) =>
  (shiny ? sprites.showdownShiny : null) ?? sprites.showdown ?? null

export const hasAnimated = (sprites: SpriteSet) =>
  Boolean(sprites.showdown || sprites.showdownShiny)
