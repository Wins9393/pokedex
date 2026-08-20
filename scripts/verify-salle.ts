/*
 * Vérification de l'arbitre en ligne, contre un vrai serveur.
 *
 *   cd serveur && npx wrangler dev     (dans un autre terminal)
 *   npm run verify:salle
 *
 * Le moteur est déjà couvert par `verify:battle` ; ce qui est en jeu ici
 * est ailleurs, et ne se voit qu'à deux : les deux téléphones reçoivent-ils
 * le même combat, un coup en retard est-il ignoré, un joueur qui recharge
 * sa page retrouve-t-il son camp, et une salle pleine refuse-t-elle poliment ?
 *
 * Rien de tout cela ne se teste en pur calcul : il faut deux connexions
 * simultanées et un arbitre entre elles.
 *
 * Le contrôle du minuteur attend un vrai délai de réflexion — comptez une
 * quarantaine de secondes pour l'ensemble.
 */
import { readFileSync } from 'node:fs'

import { normalizeMoves, normalizeMovesets } from '@/api/normalize'
import { doitRemplacer } from '@/lib/battle/engine'
import { creerBattler } from '@/lib/battle/montage'
import { DELAI_TOUR_MS, PROTOCOLE } from '@/lib/battle/protocole'
import type { MessageClient, MessageServeur } from '@/lib/battle/protocole'
import type { Battler } from '@/lib/battle/types'

const ARBITRE = process.env.ARBITRE ?? 'ws://localhost:8787'
const CACHE = new URL('../node_modules/.cache/verify-battle.json', import.meta.url).pathname

let echecs = 0
const ok = (nom: string, condition: boolean, detail = '') => {
  console.log(`  ${condition ? '✓' : '✗'} ${nom}${detail ? '  — ' + detail : ''}`)
  if (!condition) echecs++
}

/* ------------------------------------------------------------------ *
 * Deux équipes, montées comme le ferait un téléphone
 * ------------------------------------------------------------------ */

let brut: {
  sujets: { pokemon: { id: number; name: string; types: unknown[]; stats: unknown[]; species: { names: { name: string }[] } }[] }
  moves: unknown
  movesets: unknown
}

try {
  brut = JSON.parse(readFileSync(CACHE, 'utf8'))
} catch {
  console.log("\nLes données ne sont pas en cache : lance d'abord `npm run verify:battle`.\n")
  process.exit(1)
}

const moves = normalizeMoves(brut.moves as never)
const parId = new Map(moves.map((m) => [m.id, m]))
const movesets = normalizeMovesets(brut.movesets as never)

const summary = (id: number) => {
  const s = brut.sujets.pokemon.find((p) => p.id === id)!
  return {
    id,
    slug: s.name,
    name: s.species.names[0]?.name ?? s.name,
    genus: '',
    types: (s.types as { type: { name: string } }[]).map((t) => t.type.name),
    stats: Object.fromEntries(
      (s.stats as { base_stat: number; stat: { name: string } }[]).map((x) => [
        x.stat.name,
        x.base_stat,
      ]),
    ),
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
  } as never
}

const equipeDe = (ids: number[]): Battler[] =>
  ids.map((id) => creerBattler(summary(id), null, false, movesets[id] ?? [], parId))

/* ------------------------------------------------------------------ *
 * Un téléphone
 * ------------------------------------------------------------------ */

type Telephone = {
  envoyer: (message: MessageClient) => void
  attendre: <T extends MessageServeur['type']>(
    type: T,
    delai?: number,
  ) => Promise<Extract<MessageServeur, { type: T }>>
  recus: MessageServeur[]
  fermer: () => void
}

function telephone(code: string): Promise<Telephone> {
  return new Promise((resoudre, rejeter) => {
    const ws = new WebSocket(`${ARBITRE}/${code}`)
    const recus: MessageServeur[] = []
    const guets: { type: string; ok: (m: MessageServeur) => void }[] = []

    ws.onmessage = (evenement) => {
      const message = JSON.parse(String(evenement.data)) as MessageServeur
      recus.push(message)
      const index = guets.findIndex((g) => g.type === message.type)
      if (index >= 0) guets.splice(index, 1)[0].ok(message)
    }

    ws.onerror = () => rejeter(new Error(`arbitre injoignable sur ${ARBITRE}`))

    ws.onopen = () =>
      resoudre({
        envoyer: (message) => ws.send(JSON.stringify(message)),
        recus,
        fermer: () => ws.close(),
        attendre: (type, delai = 4000) =>
          new Promise((ok, ko) => {
            const dejaLa = recus.find((m) => m.type === type)
            if (dejaLa) return ok(dejaLa as never)
            const minuteur = setTimeout(() => ko(new Error(`pas de « ${type} » en ${delai} ms`)), delai)
            guets.push({
              type,
              ok: (m) => {
                clearTimeout(minuteur)
                ok(m as never)
              },
            })
          }),
      })
  })
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))
const codeAuHasard = () =>
  Array.from({ length: 4 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ'[Math.floor(Math.random() * 23)]).join('')

/* ------------------------------------------------------------------ */

console.log(`\nArbitre : ${ARBITRE}\n`)

/* 1. Une partie complète, à deux ---------------------------------- */
console.log('Une partie de bout en bout')
{
  const code = codeAuHasard()
  const un = await telephone(code)
  const deux = await telephone(code)

  un.envoyer({ type: 'rejoindre', protocole: PROTOCOLE, jeton: 'jeton-un', nom: 'Vincent' })
  const salleUn = await un.attendre('salle')
  deux.envoyer({ type: 'rejoindre', protocole: PROTOCOLE, jeton: 'jeton-deux', nom: 'Léa' })
  const salleDeux = await deux.attendre('salle')

  ok(
    "l'arbitre attribue un camp à chacun",
    salleUn.salle.moi === 0 && salleDeux.salle.moi === 1,
    `${salleUn.salle.moi} et ${salleDeux.salle.moi}`,
  )

  await pause(150)
  const vueUn = [...un.recus].reverse().find((m) => m.type === 'salle')
  ok(
    "chacun apprend le nom de l'autre",
    vueUn?.type === 'salle' && vueUn.salle.nomAdverse === 'Léa',
    vueUn?.type === 'salle' ? String(vueUn.salle.nomAdverse) : '—',
  )

  un.envoyer({ type: 'equipe', battlers: equipeDe([6, 25, 143]) })
  await pause(150)
  ok(
    "une seule équipe ne lance rien",
    !un.recus.some((m) => m.type === 'debut'),
    "l'arbitre attend les deux",
  )

  deux.envoyer({ type: 'equipe', battlers: equipeDe([3, 111, 65]) })
  const debutUn = await un.attendre('debut')
  const debutDeux = await deux.attendre('debut')

  ok(
    'les deux téléphones reçoivent le même combat',
    JSON.stringify(debutUn.etat) === JSON.stringify(debutDeux.etat),
    `${debutUn.etat.teams[0].battlers.length} contre ${debutUn.etat.teams[1].battlers.length}`,
  )
  ok(
    'monté par l’arbitre, avec sa propre graine',
    typeof debutUn.etat.seed === 'number' && debutUn.etat.turn === 1,
  )

  /* Un tour : un seul coup ne résout rien, les deux le font. */
  un.envoyer({ type: 'action', tour: 1, action: { kind: 'move', slot: 0 } })
  const attente = await un.attendre('attente')
  ok("un coup seul met l'autre en attente", attente.tour === 1)
  await pause(150)
  ok(
    "et ne dit rien à l'adversaire",
    !deux.recus.some((m) => m.type === 'tour'),
    'le choix de l’un ne fuit pas vers l’autre',
  )

  deux.envoyer({ type: 'action', tour: 1, action: { kind: 'move', slot: 0 } })
  const tourUn = await un.attendre('tour')
  const tourDeux = await deux.attendre('tour')

  ok(
    'le tour résolu arrive identique des deux côtés',
    JSON.stringify(tourUn) === JSON.stringify(tourDeux),
    `${tourUn.evenements.length} événements`,
  )
  ok('et le combat a bien avancé', tourUn.etat.turn === 2)

  /* Un coup en retard ne doit rien déclencher. */
  const avant = un.recus.filter((m) => m.type === 'tour').length
  un.envoyer({ type: 'action', tour: 1, action: { kind: 'move', slot: 1 } })
  deux.envoyer({ type: 'action', tour: 1, action: { kind: 'move', slot: 1 } })
  await pause(250)
  ok(
    'un coup daté du tour précédent est ignoré',
    un.recus.filter((m) => m.type === 'tour').length === avant,
    'double envoi et retardataires compris',
  )

  un.fermer()
  deux.fermer()
}

/* 2. Reprendre sa place après un rechargement --------------------- */
console.log('\nRechargement en pleine partie')
{
  const code = codeAuHasard()
  const un = await telephone(code)
  const deux = await telephone(code)

  /*
   * Les deux arrivées sont séquencées, et ce n'est pas de la coquetterie :
   * ce sont deux connexions distinctes, donc rien ne garantit que l'ordre
   * d'envoi soit l'ordre d'arrivée. En local la latence nulle le masquait ;
   * contre un vrai serveur, le camp attribué changeait d'un essai à
   * l'autre. Deux joueurs qui rejoignent en même temps prennent bien un
   * camp arbitraire — c'est le test qui n'avait pas à en supposer un.
   */
  un.envoyer({ type: 'rejoindre', protocole: PROTOCOLE, jeton: 'jeton-un', nom: 'Vincent' })
  await un.attendre('salle')
  deux.envoyer({ type: 'rejoindre', protocole: PROTOCOLE, jeton: 'jeton-deux', nom: 'Léa' })
  await deux.attendre('salle')

  un.envoyer({ type: 'equipe', battlers: equipeDe([6, 25, 143]) })
  deux.envoyer({ type: 'equipe', battlers: equipeDe([3, 111, 65]) })
  const debut = await un.attendre('debut')

  // Le téléphone du joueur 1 se recharge : nouvelle socket, même jeton.
  un.fermer()
  await pause(250)
  const revenu = await telephone(code)
  revenu.envoyer({ type: 'rejoindre', protocole: PROTOCOLE, jeton: 'jeton-un', nom: 'Vincent' })
  const salle = await revenu.attendre('salle')
  const repris = await revenu.attendre('debut')

  ok('il retrouve son camp', salle.salle.moi === 0, `camp ${salle.salle.moi}`)
  ok(
    'et le combat tel qu’il était',
    JSON.stringify(repris.etat) === JSON.stringify(debut.etat),
    `tour ${repris.etat.turn}`,
  )
  ok("l'équipe déjà envoyée n'est pas redemandée", salle.salle.equipeEnvoyee)

  const vueDeux = [...deux.recus].reverse().find((m) => m.type === 'salle')
  ok(
    "l'adversaire a vu la coupure puis le retour",
    vueDeux?.type === 'salle' && vueDeux.salle.adversaireConnecte,
    'l’arbitre republie la salle à chaque changement',
  )

  revenu.fermer()
  deux.fermer()
}

/* 3. Une socket périmée ne fait pas disparaître son joueur --------- */
console.log('\nDeux connexions pour un même camp')
{
  const code = codeAuHasard()
  const un = await telephone(code)
  const deux = await telephone(code)
  un.envoyer({ type: 'rejoindre', protocole: PROTOCOLE, jeton: 'jeton-un', nom: 'Vincent' })
  await un.attendre('salle')
  deux.envoyer({ type: 'rejoindre', protocole: PROTOCOLE, jeton: 'jeton-deux', nom: 'Léa' })
  await deux.attendre('salle')

  /*
   * Le cas que React provoque à chaque montage en mode strict, et qu'un
   * réseau mobile provoque tout seul : une seconde socket s'ouvre avant que
   * la fermeture de la première ne soit traitée.
   */
  const bis = await telephone(code)
  bis.envoyer({ type: 'rejoindre', protocole: PROTOCOLE, jeton: 'jeton-un', nom: 'Vincent' })
  await bis.attendre('salle')
  un.fermer()
  await pause(400)

  const vue = [...deux.recus].reverse().find((m) => m.type === 'salle')
  ok(
    "la fermeture de l'ancienne ne déclare pas le joueur absent",
    vue?.type === 'salle' && vue.salle.adversaireConnecte,
    'sinon les deux joueurs s’attendent pour toujours',
  )

  bis.fermer()
  deux.fermer()
}

/* 4. Le minuteur, et le retour à la sélection ---------------------- */
console.log(`\nMinuteur de tour (${DELAI_TOUR_MS / 1000} s, patience)`)
{
  const code = codeAuHasard()
  const un = await telephone(code)
  const deux = await telephone(code)
  un.envoyer({ type: 'rejoindre', protocole: PROTOCOLE, jeton: 'jeton-un', nom: 'Vincent' })
  await un.attendre('salle')
  deux.envoyer({ type: 'rejoindre', protocole: PROTOCOLE, jeton: 'jeton-deux', nom: 'Léa' })
  await deux.attendre('salle')

  // Alakazam en tête côté 2 : il est plus rapide que Dracaufeu, donc son
  // coup automatique se voit à coup sûr dans le récit du tour.
  un.envoyer({ type: 'equipe', battlers: equipeDe([6, 25, 143]) })
  deux.envoyer({ type: 'equipe', battlers: equipeDe([65, 3, 111]) })
  const debut = await un.attendre('debut')

  ok(
    "le combat s'ouvre avec une date limite",
    typeof debut.echeance === 'number' && debut.echeance > Date.now(),
    `${Math.round(((debut.echeance ?? 0) - Date.now()) / 1000)} s pour choisir`,
  )

  // Un seul joueur répond ; l'autre laisse filer.
  un.envoyer({ type: 'action', tour: 1, action: { kind: 'move', slot: 0 } })
  await un.attendre('attente')

  const depart = Date.now()
  const tour = await un.attendre('tour', DELAI_TOUR_MS + 20_000)
  const attendu = Math.round((Date.now() - depart) / 1000)

  ok(
    'le tour se résout seul quand le temps est écoulé',
    tour.etat.turn === 2,
    `au bout de ${attendu} s`,
  )
  ok(
    "et l'arbitre dit pour qui il a joué",
    tour.automatiques.length === 1 && tour.automatiques[0] === 1,
    `camp ${tour.automatiques.join(', ')}`,
  )
  ok(
    'le coup joué pour absence en est un vrai',
    tour.evenements.some((e) => e.kind === 'move' && e.side === 1),
    tour.evenements.filter((e) => e.kind === 'move').map((e) => e.move).join(' / '),
  )
  ok(
    'la fenêtre suivante rouvre avec sa propre marge de lecture',
    (tour.echeance ?? 0) - Date.now() > DELAI_TOUR_MS,
    'le récit à lire est payé par l’arbitre',
  )

  /* Retour à la sélection, dans la même salle. */
  un.envoyer({ type: 'nouvelles-equipes' })
  await pause(300)
  ok(
    "on ne recompose pas au milieu d'un combat",
    !un.recus.some((m) => m.type === 'nouvelle-partie'),
    'la demande est ignorée tant que personne n’a gagné',
  )

  un.fermer()
  deux.fermer()
}

/* 5. Un combat mené jusqu'au bout, puis de nouvelles équipes ------- */
console.log('\nUn combat entier, arbitré')
{
  const code = codeAuHasard()
  const un = await telephone(code)
  const deux = await telephone(code)
  un.envoyer({ type: 'rejoindre', protocole: PROTOCOLE, jeton: 'jeton-un', nom: 'Vincent' })
  await un.attendre('salle')
  deux.envoyer({ type: 'rejoindre', protocole: PROTOCOLE, jeton: 'jeton-deux', nom: 'Léa' })
  await deux.attendre('salle')

  un.envoyer({ type: 'equipe', battlers: equipeDe([6, 25, 143]) })
  deux.envoyer({ type: 'equipe', battlers: equipeDe([3, 111, 65]) })

  let etat = (await un.attendre('debut')).etat
  let tours = 0
  let desaccords = 0

  while (etat.winner === null && tours < 80) {
    const remplacants = ([0, 1] as const).filter((side) => doitRemplacer(etat, side))

    if (remplacants.length > 0) {
      for (const side of remplacants) {
        const index = etat.teams[side].battlers.findIndex((b) => b.hp > 0)
        const client = side === 0 ? un : deux
        client.envoyer({ type: 'remplacement', tour: etat.turn, index })
      }
    } else {
      un.envoyer({ type: 'action', tour: etat.turn, action: { kind: 'move', slot: 0 } })
      deux.envoyer({ type: 'action', tour: etat.turn, action: { kind: 'move', slot: 0 } })
    }

    const vuUn = await un.attendre('tour', 8000)
    const vuDeux = await deux.attendre('tour', 8000)
    if (JSON.stringify(vuUn.etat) !== JSON.stringify(vuDeux.etat)) desaccords++

    etat = vuUn.etat
    tours++
    un.recus.length = 0
    deux.recus.length = 0
  }

  ok(
    'un combat complet se déroule sans divergence',
    etat.winner !== null && desaccords === 0,
    `${tours} échanges, vainqueur : ${(etat.winner ?? 0) + 1}`,
  )
  ok(
    'les deux camps ont bien joué leurs remplaçants',
    etat.teams.some((equipe) => equipe.battlers.every((b) => b.hp <= 0)),
    'une équipe entière est K.O.',
  )

  /* Et maintenant, de nouvelles équipes. */
  un.envoyer({ type: 'nouvelles-equipes' })
  const rendu = await deux.attendre('nouvelle-partie')
  ok("l'adversaire est prévenu qu'on repart de la sélection", rendu.type === 'nouvelle-partie')

  await pause(200)
  const salleApres = [...deux.recus].reverse().find((m) => m.type === 'salle')
  ok(
    'les deux équipes sont rendues',
    salleApres?.type === 'salle' &&
      !salleApres.salle.equipeEnvoyee &&
      !salleApres.salle.adversairePret,
    'la salle reste, les équipes non',
  )

  un.fermer()
  deux.fermer()
}

/* 6. Ce que l'arbitre refuse -------------------------------------- */
console.log("\nCe que l'arbitre refuse")
{
  const code = codeAuHasard()
  const un = await telephone(code)
  const deux = await telephone(code)
  un.envoyer({ type: 'rejoindre', protocole: PROTOCOLE, jeton: 'a', nom: 'A' })
  await un.attendre('salle')
  deux.envoyer({ type: 'rejoindre', protocole: PROTOCOLE, jeton: 'b', nom: 'B' })
  await deux.attendre('salle')

  const troisieme = await telephone(code)
  troisieme.envoyer({ type: 'rejoindre', protocole: PROTOCOLE, jeton: 'c', nom: 'C' })
  const pleine = await troisieme.attendre('erreur')
  ok('un troisième joueur est éconduit', pleine.raison === 'pleine')

  const perime = await telephone(code)
  perime.envoyer({ type: 'rejoindre', protocole: PROTOCOLE + 1, jeton: 'd', nom: 'D' })
  const vieux = await perime.attendre('erreur')
  ok(
    'une application d’une autre version est refusée net',
    vieux.raison === 'protocole',
    'plutôt que de jouer une partie qui divergera',
  )

  const bancale = equipeDe([6, 25])
  un.envoyer({ type: 'equipe', battlers: bancale })
  const refus = await un.attendre('erreur')
  ok('une équipe de deux est refusée', refus.raison === 'refus', refus.detail ?? '')

  const trafiquee = equipeDe([6, 25, 143])
  trafiquee[0].maxHp = 9999
  trafiquee[0].hp = 9999
  un.envoyer({ type: 'equipe', battlers: trafiquee })
  await pause(200)
  const erreurs = un.recus.filter((m) => m.type === 'erreur').length
  ok(
    'des points de vie hors de toute échelle aussi',
    erreurs >= 2,
    'contrôle d’allure, pas preuve d’honnêteté',
  )

  un.fermer()
  deux.fermer()
  troisieme.fermer()
  perime.fermer()
}

console.log(echecs === 0 ? '\nTout est vert.\n' : `\n${echecs} vérification(s) en échec.\n`)
process.exit(echecs === 0 ? 0 : 1)
