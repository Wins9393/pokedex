/*
 * Vérification du moteur de combat sur des valeurs de référence connues.
 *
 *   npm run verify:battle
 *
 * Le moteur est du calcul pur : une erreur d'arrondi ou un multiplicateur
 * appliqué dans le mauvais ordre ne se voit pas à l'écran, seulement dans
 * des chiffres légèrement faux. D'où ce contrôle hors interface, sur des
 * valeurs calculées à la main depuis la formule publiée.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { normalizeBattleForms, normalizeIndex, normalizeMoves, normalizeMovesets } from '@/api/normalize'
import { FORMS_QUERY, INDEX_QUERY, MOVES_QUERY, MOVESETS_QUERY } from '@/api/queries'
import { buildTypeChart } from '@/lib/type-chart'
import { statsDeCombat } from '@/lib/battle/stats'
import { formesJouables, idsDesFormes } from '@/lib/battle/forms'
import { estUnRendu, spritesDeDos } from '@/lib/sprites'
import { choisirAttaques, LUTTE } from '@/lib/battle/moveset'
import { resoudreFrappe } from '@/lib/battle/damage'
import { creerBattler, creerCombat, resoudreTour, actif } from '@/lib/battle/engine'
import { createRng } from '@/lib/battle/rng'

/* Les données de l'API sont mises de côté pour que les relances soient
 * instantanées et n'aillent pas taper PokéAPI à chaque exécution. */
const CACHE = new URL('../node_modules/.cache/verify-battle.json', import.meta.url).pathname
const ENDPOINT = 'https://graphql.pokeapi.co/v1beta2'

const gql = async (query: string, variables?: Record<string, unknown>) => {
  const r = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const j = await r.json()
  if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 300))
  return j.data
}

const IDS = [6, 3, 25, 111, 143, 65]

/*
 * Sujets du contrôle des formes : une Méga classique, une forme régionale
 * qui gagne un type absent de son espèce, une Méga récente sans aucune
 * capacité dans l'API — et leurs espèces de base, dont il faut le vivier.
 */
const MEWTWO_MEGA_X = 10043
const OSSATUEUR_ALOLA = 10115
const MELODELFE_MEGA = 10278
const IDS_FORMES = [150, MEWTWO_MEGA_X, 105, OSSATUEUR_ALOLA, 36, MELODELFE_MEGA]

const SUJETS_QUERY = `
  query Sujets($ids: [Int!]!) {
    pokemon(where: { id: { _in: $ids } }, order_by: { id: asc }) {
      id
      name
      types: pokemontypes(order_by: { slot: asc }) { type { name } }
      stats: pokemonstats(order_by: { stat_id: asc }) { base_stat stat { name } }
      species: pokemonspecy { names: pokemonspeciesnames(where: { language_id: { _eq: 5 } }) { name } }
    }
    efficacy: typeefficacy { damage_factor damage_type_id target_type_id }
  }
`

/*
 * Disponibilité des sprites, pour vérifier qu'aucun combattant ne finit sur
 * un cadre vide.
 *
 * `sprites(path: …)` projette dans le JSON côté serveur : on récupère quatre
 * URLs par Pokémon au lieu du blob de cinq kilooctets, soit ~300 Ko pour les
 * 1244 combattants contre plus de dix mégaoctets.
 */
const SPRITES_QUERY = `
  query Sprites {
    pokemon(where: { _or: [{ id: { _lte: 1025 } }, { is_default: { _eq: false } }] }) {
      id
      sprites: pokemonsprites {
        showdownDos: sprites(path: "other.showdown.back_default")
        pixelDos: sprites(path: "back_default")
        artwork: sprites(path: "other.official-artwork.front_default")
        home: sprites(path: "other.home.front_default")
      }
    }
  }
`

async function donnees() {
  if (existsSync(CACHE)) return JSON.parse(readFileSync(CACHE, 'utf8'))
  const [sujets, moves, movesets, formes, index, movesetsFormes, sprites] = await Promise.all([
    gql(SUJETS_QUERY, { ids: IDS }),
    gql(MOVES_QUERY),
    gql(MOVESETS_QUERY, { ids: IDS }),
    gql(FORMS_QUERY),
    gql(INDEX_QUERY),
    gql(MOVESETS_QUERY, { ids: IDS_FORMES }),
    gql(SPRITES_QUERY),
  ])
  const payload = { sujets, moves, movesets, formes, index, movesetsFormes, sprites }
  mkdirSync(dirname(CACHE), { recursive: true })
  writeFileSync(CACHE, JSON.stringify(payload))
  return payload
}

/* ------------------------------------------------------------------ */

let echecs = 0
const ok = (nom: string, condition: boolean, detail = '') => {
  console.log(`  ${condition ? '✓' : '✗'} ${nom}${detail ? '  — ' + detail : ''}`)
  if (!condition) echecs++
}

const brut = await donnees()

const chart = buildTypeChart(brut.sujets.efficacy)
const moves = normalizeMoves(brut.moves)
const movesets = normalizeMovesets(brut.movesets)
const parId = new Map(moves.map((m) => [m.id, m]))

type Sujet = {
  id: number
  name: string
  types: { type: { name: string } }[]
  stats: { base_stat: number; stat: { name: string } }[]
  species: { names: { name: string }[] }
}

const summary = (s: Sujet) => ({
  id: s.id,
  slug: s.name,
  name: s.species.names[0]?.name ?? s.name,
  genus: '',
  types: s.types.map((t) => t.type.name),
  stats: Object.fromEntries(s.stats.map((x) => [x.stat.name, x.base_stat])),
  statTotal: 0,
  height: 0,
  weight: 0,
  baseExperience: null,
  generation: 1,
  isLegendary: false,
  isMythical: false,
  isBaby: false,
  captureRate: 0,
  evolutionChainId: null,
  nameKey: '',
  slugKey: '',
}) as never

const sujet = (id: number) => summary(brut.sujets.pokemon.find((p: Sujet) => p.id === id))
const battler = (id: number) => creerBattler(sujet(id), null, false, movesets[id] ?? [], parId)

console.log(`\nDonnées : ${moves.length} attaques, ${Object.keys(movesets).length} listes\n`)

/* 1. Statistiques au niveau 50 ------------------------------------- */
console.log('Statistiques de Dracaufeu au niveau 50 (IV 31, EV 0, nature neutre)')
{
  const dracaufeu = brut.sujets.pokemon.find((p: Sujet) => p.id === 6)
  const base = Object.fromEntries(
    dracaufeu.stats.map((x: { base_stat: number; stat: { name: string } }) => [
      x.stat.name,
      x.base_stat,
    ]),
  )
  const s = statsDeCombat(base as never)
  const attendu = {
    hp: 153,
    attack: 104,
    defense: 98,
    'special-attack': 129,
    'special-defense': 105,
    speed: 120,
  }
  for (const [cle, valeur] of Object.entries(attendu)) {
    ok(cle.padEnd(16), s[cle as keyof typeof s] === valeur, `obtenu ${s[cle as keyof typeof s]}, attendu ${valeur}`)
  }
}

/* 2. STAB et efficacité -------------------------------------------- */
console.log('\nLance-Flammes de Dracaufeu sur Florizarre (Plante/Poison)')
{
  const dracaufeu = battler(6)
  const florizarre = battler(3)
  const lanceFlammes = moves.find((m) => m.name === 'Lance-Flammes')!

  const echantillon = Array.from({ length: 400 }, (_, i) =>
    resoudreFrappe(dracaufeu, florizarre, lanceFlammes, chart, createRng(i + 1)),
  )
  const sansCritique = echantillon.filter((f) => !f.critique && f.touche)
  const min = Math.min(...sansCritique.map((f) => f.degats))
  const max = Math.max(...sansCritique.map((f) => f.degats))

  /*
   * Calcul de référence, fait à la main depuis la formule publiée :
   *   Dracaufeu AtqSpé 129 · Florizarre DéfSpé 120 · Lance-Flammes 90
   *   base   = ⌊22 × 90 × 129 / 120⌋ = 2128 → ⌊2128/50⌋ + 2 = 44
   *   min    = ⌊44 × 0,85⌋ = 37 → STAB ⌊37 × 1,5⌋ = 55 → ×2 = 110
   *   max    = 44          → STAB ⌊44 × 1,5⌋ = 66 → ×2 = 132
   * Soit 110 à 132 PV sur les 155 de Florizarre.
   */
  ok('efficacité ×2 (Feu contre Plante)', echantillon[0].efficacite === 2)
  ok('dégâts conformes au calcul manuel', min === 110 && max === 132, `${min}–${max} PV, attendu 110–132`)
  ok('des coups critiques surviennent', echantillon.some((f) => f.critique))
  ok(
    'les critiques frappent plus fort',
    Math.max(...echantillon.filter((f) => f.critique).map((f) => f.degats)) > max,
  )
}

/* 3. Immunité ------------------------------------------------------- */
console.log('\nImmunités et résistances')
{
  const pikachu = battler(25)
  const rhinocorne = battler(111)
  const electrik = moves.find((m) => m.type === 'electric' && m.power >= 60)!
  const frappe = resoudreFrappe(pikachu, rhinocorne, electrik, chart, createRng(7))

  ok('Électrik ne touche pas un Pokémon Sol', frappe.efficacite === 0 && frappe.degats === 0)

  const lutte = resoudreFrappe(pikachu, battler(143), LUTTE, chart, createRng(7))
  ok('Lutte ignore la table des types', lutte.efficacite === 1 && lutte.degats > 0)
}

/* 4. Choix des attaques -------------------------------------------- */
console.log('\nComposition automatique des attaques')
{
  for (const id of [6, 25, 143]) {
    const b = battler(id)
    const noms = b.moves.map((s) => s.move.name)
    const aStab = b.moves.some((s) => b.types.includes(s.move.type))
    ok(`${b.name.padEnd(12)} ${noms.length} attaques`, noms.length === 4, noms.join(', '))
    ok(`${b.name.padEnd(12)} au moins une STAB`, aStab)
  }

  const a = choisirAttaques(sujet(6).types, sujet(6).stats, movesets[6], parId)
  const b = choisirAttaques(sujet(6).types, sujet(6).stats, movesets[6], parId)
  ok(
    'le choix est déterministe',
    a.map((s) => s.move.id).join() === b.map((s) => s.move.id).join(),
  )
}

/* 5. Ordre du tour -------------------------------------------------- */
console.log("\nOrdre d'attaque")
{
  const lent = battler(143) // Ronflex, Vitesse 30
  const rapide = battler(65) // Alakazam, Vitesse 120

  const etat = creerCombat([[lent], [rapide]], 42)
  ok(
    'le plus rapide frappe en premier (Vitesse)',
    (() => {
      const { events } = resoudreTour(etat, [{ kind: 'move', slot: 0 }, { kind: 'move', slot: 0 }], chart)
      return events.find((e) => e.kind === 'move')?.side === 1
    })(),
    `Ronflex ${lent.stats.speed} contre Alakazam ${rapide.stats.speed}`,
  )

  const vive = moves.find((m) => m.name === 'Vive-Attaque')!
  const lentPrioritaire = { ...lent, moves: [{ move: vive, pp: vive.pp, maxPp: vive.pp }] }
  const etat2 = creerCombat([[lentPrioritaire], [rapide]], 42)
  ok(
    'la priorité passe devant la Vitesse',
    (() => {
      const { events } = resoudreTour(etat2, [{ kind: 'move', slot: 0 }, { kind: 'move', slot: 0 }], chart)
      return events.find((e) => e.kind === 'move')?.side === 0
    })(),
    `Vive-Attaque priorité ${vive.priority}`,
  )
}

/* 6. Reproductibilité ----------------------------------------------- */
console.log('\nReproductibilité à graine égale')
{
  const equipes = (): [ReturnType<typeof battler>[], ReturnType<typeof battler>[]] => [
    [battler(6), battler(25), battler(143)],
    [battler(3), battler(111), battler(65)],
  ]
  const jouer = (seed: number) => {
    let etat = creerCombat(equipes(), seed)
    const journal: string[] = []
    for (let i = 0; i < 5; i++) {
      const r = resoudreTour(etat, [{ kind: 'move', slot: 0 }, { kind: 'move', slot: 0 }], chart)
      etat = r.etat
      journal.push(JSON.stringify(r.events))
    }
    return journal.join('|')
  }

  ok('même graine → même déroulé', jouer(1234) === jouer(1234))
  ok('graine différente → déroulé différent', jouer(1234) !== jouer(9876))
}

/* 7. Formes alternatives --------------------------------------------- */
console.log('\nFormes alternatives')
{
  const toutes = normalizeBattleForms(brut.formes)
  const dex = normalizeIndex(brut.index).pokemon
  const parEspeceDex = new Map(dex.map((p) => [p.id, p]))
  const jouables = formesJouables(toutes, parEspeceDex)
  const aplat = [...jouables.values()].flat()

  ok('la table brute compte 326 formes', toutes.length === 326, `${toutes.length}`)
  ok(
    '219 formes jouables sur 179 espèces',
    aplat.length === 219 && jouables.size === 179,
    `${aplat.length} formes, ${jouables.size} espèces`,
  )
  ok(
    'les Gigamax sont écartées (mêmes types et stats que leur espèce)',
    aplat.filter((f) => f.name.includes('Gigamax')).length === 0,
  )
  ok(
    'Éthernatos Infinimax est hors barème',
    !aplat.some((f) => f.id === 10190),
    'total 1125',
  )
  ok(
    'aucun libellé en double',
    new Set(aplat.map((f) => f.name)).size === aplat.length,
    'les 7 noyaux de Minior sont réduits à un',
  )

  const forme = (id: number) => aplat.find((f) => f.id === id)!
  const capacites = normalizeMovesets(brut.movesetsFormes)
  const union = (espece: number, id: number) => [
    ...new Set([...(capacites[espece] ?? []), ...(capacites[id] ?? [])]),
  ]

  /* Une forme change les statistiques, et rien d'autre dans le moteur. */
  {
    const mega = forme(MEWTWO_MEGA_X)
    const s = statsDeCombat(mega.stats)
    // Attaque = ⌊(2×190 + 31) × 50/100⌋ + 5 = ⌊205,5⌋ + 5 = 210
    ok('Méga-Mewtwo X : 210 d’Attaque au niveau 50', s.attack === 210, `${s.attack}`)
    ok('Méga-Mewtwo X est Psy/Combat', mega.types.join('/') === 'psychic/fighting')
  }

  /*
   * Le point qui justifie l'union des viviers, dans les deux sens : une
   * forme régionale porte des attaques que son espèce n'a pas, et une Méga
   * récente n'en a aucune dans l'API.
   */
  {
    const ossatueur = forme(OSSATUEUR_ALOLA)
    const base = choisirAttaques(
      ossatueur.types,
      ossatueur.stats,
      capacites[105] ?? [],
      parId,
    )
    const unies = choisirAttaques(
      ossatueur.types,
      ossatueur.stats,
      union(105, OSSATUEUR_ALOLA),
      parId,
    )

    /*
     * Ossatueur d'Alola est Feu/Spectre. Le Feu, son espèce l'apprend déjà
     * par CT ; le Spectre, non — c'est la forme seule qui le porte, et
     * c'est ce que l'union va chercher.
     */
    ok(
      'le vivier d’Ossatueur seul ne donne aucune attaque Spectre',
      !base.some((slot) => slot.move.type === 'ghost'),
    )
    ok(
      'uni à celui de la forme d’Alola, il en donne une',
      unies.some((slot) => slot.move.type === 'ghost'),
      unies.map((slot) => slot.move.name).join(', '),
    )
  }

  {
    const melodelfe = forme(MELODELFE_MEGA)
    const propre = capacites[MELODELFE_MEGA] ?? []
    const attaques = choisirAttaques(
      melodelfe.types,
      melodelfe.stats,
      union(36, MELODELFE_MEGA),
      parId,
    )

    ok('Méga-Mélodelfe n’a aucune capacité propre', propre.length === 0)
    ok(
      'elle hérite malgré tout d’attaques réelles',
      attaques.length === 4 && !attaques.some((slot) => slot.move.id === LUTTE.id),
      attaques.map((slot) => slot.move.name).join(', '),
    )
  }

  /* Le chromatique est purement visuel : le tour doit être identique. */
  {
    const espece = sujet(6)
    const normal = creerBattler(espece, null, false, movesets[6] ?? [], parId)
    const chromatique = creerBattler(espece, null, true, movesets[6] ?? [], parId)
    const adversaire = () => battler(3)

    const jouer = (mien: typeof normal) => {
      const etat = creerCombat([[mien], [adversaire()]], 4242)
      const r = resoudreTour(etat, [{ kind: 'move', slot: 0 }, { kind: 'move', slot: 0 }], chart)
      return JSON.stringify(r.events)
    }

    ok('le chromatique ne change rien au déroulé', jouer(normal) === jouer(chromatique))
  }
}

/* 8. Aucun combattant sans image -------------------------------------- */
console.log('\nDisponibilité des sprites de combat')
{
  type Dispo = {
    id: number
    sprites: {
      showdownDos: string | null
      pixelDos: string | null
      artwork: string | null
      home: string | null
    }[]
  }

  const toutes = normalizeBattleForms(brut.formes)
  const dex = normalizeIndex(brut.index).pokemon
  const jouables = formesJouables(toutes, new Map(dex.map((p) => [p.id, p])))
  const combattants = new Set([...dex.map((p) => p.id), ...idsDesFormes(jouables)])

  const parId = new Map<number, Dispo['sprites'][number]>()
  for (const entree of brut.sprites.pokemon as Dispo[]) {
    if (entree.sprites[0]) parId.set(entree.id, entree.sprites[0])
  }

  const manquants: number[] = []
  const sansSpriteDeJeu: number[] = []

  for (const id of combattants) {
    const s = parId.get(id)
    if (!s) continue
    if (!s.showdownDos && !s.pixelDos) sansSpriteDeJeu.push(id)
    if (!s.showdownDos && !s.pixelDos && !s.artwork && !s.home) manquants.push(id)
  }

  ok(
    `les ${combattants.size} combattants sont tous connus de l’API`,
    [...combattants].every((id) => parId.has(id)),
  )
  ok(
    'aucun ne se retrouve sans aucune image',
    manquants.length === 0,
    manquants.length ? `manquants : ${manquants}` : 'la chaîne aboutit toujours',
  )

  /*
   * Le repli de dernier recours n'est pas hypothétique : il existe un cas
   * réel, et ce contrôle avertira si PokéAPI en ajoute d'autres.
   */
  const nomDe = (id: number) =>
    [...jouables.values()].flat().find((f) => f.id === id)?.name ?? `n° ${id}`
  ok(
    'un seul combattant tombe sur un rendu de face',
    sansSpriteDeJeu.length === 1 && sansSpriteDeJeu[0] === 10301,
    sansSpriteDeJeu.map(nomDe).join(', ') || 'aucun',
  )

  /* Les chaînes de l'interface doivent aboutir sur ce cas précis. */
  const attendues = spritesDeDos(10301, false)
  ok(
    'la chaîne de dos de Méga-Zygarde se termine sur un rendu',
    estUnRendu(attendues[attendues.length - 1]) &&
      attendues.some((url) => url === parId.get(10301)?.artwork),
    attendues[attendues.length - 1].split('/pokemon/')[1],
  )
}

/* 9. Combat complet -------------------------------------------------- */
console.log('\nCombat complet 3 contre 3')
{
  let etat = creerCombat(
    [
      [battler(6), battler(25), battler(143)],
      [battler(3), battler(111), battler(65)],
    ],
    2026,
  )

  let tours = 0
  const rng = createRng(99)

  while (etat.winner === null && tours < 200) {
    for (const side of [0, 1] as const) {
      if (actif(etat, side).hp <= 0) {
        const suivant = etat.teams[side].battlers.findIndex((b) => b.hp > 0)
        if (suivant >= 0) etat.teams[side].active = suivant
      }
    }
    if (etat.teams.some((t) => t.battlers.every((b) => b.hp <= 0))) break

    const choix = ([0, 1] as const).map((side) => {
      const n = actif(etat, side).moves.length
      return { kind: 'move' as const, slot: Math.floor(rng() * n) }
    }) as [never, never]

    etat = resoudreTour(etat, choix, chart).etat
    tours++
  }

  ok('le combat se termine', etat.winner !== null, `${tours} tours, vainqueur : joueur ${(etat.winner ?? 0) + 1}`)
  ok(
    "l'équipe perdante est entièrement K.O.",
    etat.winner !== null && etat.teams[1 - etat.winner].battlers.every((b) => b.hp <= 0),
  )
}

console.log(echecs === 0 ? '\nTout est vert.\n' : `\n${echecs} vérification(s) en échec.\n`)
process.exit(echecs === 0 ? 0 : 1)
