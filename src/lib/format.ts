/** Retire les accents et la ponctuation pour rendre la recherche tolérante. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** `6` → `#0006` façon Pokédex. */
export const formatDexNumber = (id: number) => `#${String(id).padStart(4, '0')}`

/** L'API stocke les tailles en décimètres. */
export const formatHeight = (height: number) =>
  `${(height / 10).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m`

/** L'API stocke les poids en hectogrammes. */
export const formatWeight = (weight: number) =>
  `${(weight / 10).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`

/**
 * Le taux de capture est une valeur de jeu sur 255, pas une probabilité :
 * on l'affiche telle quelle plutôt que de la maquiller en pourcentage.
 */
export function formatCaptureRate(rate: number): string {
  const label = rate >= 200 ? 'très facile' : rate >= 120 ? 'facile' : rate >= 45 ? 'moyen' : 'difficile'
  return `${rate} / 255 · ${label}`
}

const percent = (value: number) =>
  value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })

/** -1 = asexué, sinon la valeur est la proportion de femelles sur 8. */
export function formatGenderRate(rate: number): string {
  if (rate < 0) return 'Asexué'
  const female = (rate / 8) * 100
  if (female === 0) return '100 % ♂'
  if (female === 100) return '100 % ♀'
  return `${percent(100 - female)} % ♂ · ${percent(female)} % ♀`
}

/** Les libellés d'habitat et de silhouette arrivent en minuscules de l'API. */
export const capitalize = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1)

/** Le compteur d'éclosion se traduit en pas parcourus. */
export const formatHatchSteps = (counter: number) => `${((counter + 1) * 255).toLocaleString('fr-FR')} pas`

const GROWTH_RATES: Record<string, string> = {
  slow: 'Lente',
  medium: 'Moyenne',
  fast: 'Rapide',
  'medium-slow': 'Moyenne-lente',
  'slow-then-very-fast': 'Erratique',
  'fast-then-very-slow': 'Fluctuante',
}

export const formatGrowthRate = (rate: string | null) =>
  rate ? (GROWTH_RATES[rate] ?? rate) : null

const EGG_GROUPS: Record<string, string> = {
  monster: 'Monstrueux',
  water1: 'Aquatique 1',
  water2: 'Aquatique 2',
  water3: 'Aquatique 3',
  bug: 'Insectoïde',
  flying: 'Volant',
  ground: 'Terrestre',
  fairy: 'Féerique',
  plant: 'Végétal',
  humanshape: 'Humanoïde',
  mineral: 'Minéral',
  indeterminate: 'Amorphe',
  ditto: 'Métamorph',
  dragon: 'Draconique',
  'no-eggs': 'Inconnu',
}

export const formatEggGroup = (slug: string, fallback?: string) =>
  EGG_GROUPS[slug] ?? fallback ?? slug

/**
 * Les textes du jeu contiennent des sauts de ligne de mise en page, des
 * césures conditionnelles, et — pour certains talents — la séquence
 * littérale « \n » en toutes lettres plutôt qu'un vrai retour à la ligne.
 */
export const cleanFlavorText = (text: string) =>
  text
    .replace(/\\n|\\f|\\r/g, ' ')
    .replace(/[\n\f\r­]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()

/** `charizard-mega-x` → `Charizard Mega X`, pour les rares formes sans libellé traduit. */
export const prettifySlug = (slug: string) =>
  slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
