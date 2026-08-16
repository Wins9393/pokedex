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

import { normalizeMoves, normalizeMovesets } from '@/api/normalize'
import { MOVES_QUERY, MOVESETS_QUERY } from '@/api/queries'
import { buildTypeChart } from '@/lib/type-chart'
import { statsDeCombat } from '@/lib/battle/stats'
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

async function donnees() {
  if (existsSync(CACHE)) return JSON.parse(readFileSync(CACHE, 'utf8'))
  const [sujets, moves, movesets] = await Promise.all([
    gql(SUJETS_QUERY, { ids: IDS }),
    gql(MOVES_QUERY),
    gql(MOVESETS_QUERY, { ids: IDS }),
  ])
  const payload = { sujets, moves, movesets }
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
const battler = (id: number) => creerBattler(sujet(id), movesets[id] ?? [], parId)

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

/* 7. Combat complet -------------------------------------------------- */
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
