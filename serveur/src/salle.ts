import { DurableObject } from 'cloudflare:workers'
import { creerCombat, doitRemplacer, remplacer, resoudreTour } from '../../src/lib/battle/engine'
import { choisirActionIA, choisirRemplacantIA } from '../../src/lib/battle/ia'
import {
  DELAI_TOUR_MS,
  MARGE_RECIT_MS,
  PROTOCOLE,
  equipeAcceptable,
} from '../../src/lib/battle/protocole'
import type {
  EtatSalle,
  MessageClient,
  MessageServeur,
  RaisonErreur,
} from '../../src/lib/battle/protocole'
import type { Action, BattleEvent, BattleState, Battler, Side } from '../../src/lib/battle/types'
import type { TypeChart } from '../../src/lib/type-chart'
import table from './table-des-types.json'

/**
 * Une salle de combat.
 *
 * Un objet durable est une classe dont la plateforme garantit qu'il
 * n'existe **qu'une seule instance vivante au monde** pour un identifiant
 * donné — ici le code à quatre lettres. Les deux téléphones s'adressent
 * donc au même objet, où qu'ils soient, et ses messages sont traités un par
 * un : aucune course entre les deux joueurs, aucun verrou à poser.
 *
 * C'est ce qui rend le modèle si direct : la salle de jeu et l'objet
 * serveur sont la même chose.
 */

/**
 * La table des types, figée dans l'arbitre.
 *
 * Il ne la demande pas à PokéAPI — ce serait une dépendance réseau au
 * milieu d'un combat — et surtout il ne l'accepte pas d'un client : une
 * table trafiquée rendrait toutes ses attaques super efficaces. Ce sont
 * dix-huit lignes de dix-huit nombres qui ne bougent qu'à l'arrivée d'une
 * génération, et `verify:battle` échoue si celle-ci s'écarte de l'API.
 */
const CHART = table as TypeChart

/** Sans nouvelle des deux joueurs pendant ce temps, la salle s'efface. */
const OUBLI_MS = 1000 * 60 * 60 * 6

type Joueur = {
  jeton: string
  nom: string
  equipe: Battler[] | null
  connecte: boolean
  /**
   * Numéro de la connexion en cours pour ce camp.
   *
   * Sans lui, la fermeture d'une socket périmée déclarait le joueur absent
   * alors qu'il venait de se rebrancher : le `close` de l'ancienne arrive
   * après le `rejoindre` de la nouvelle, et l'adversaire voyait « en
   * attente » pour toujours. On ne croit donc une fermeture que si elle
   * concerne la connexion courante.
   */
  session: number
}

type Partie = {
  joueurs: [Joueur | null, Joueur | null]
  etat: BattleState | null
  /** Le coup déjà reçu, gardé secret jusqu'à ce que l'autre arrive. */
  enAttente: [Action | null, Action | null]
  /** Date limite du choix en cours, `null` hors fenêtre de décision. */
  echeance: number | null
  /** Date à partir de laquelle la salle peut être oubliée. */
  oubli: number
}

const VIDE: Partie = {
  joueurs: [null, null],
  etat: null,
  enAttente: [null, null],
  echeance: null,
  oubli: 0,
}

type Attache = { side: Side; session: number }

export class Salle extends DurableObject {
  /** Une seule connexion par camp : la précédente est fermée à la reprise. */
  async fetch(requete: Request): Promise<Response> {
    if (requete.headers.get('Upgrade') !== 'websocket') {
      return new Response('Cette adresse attend une connexion WebSocket.', { status: 426 })
    }

    const paire = new WebSocketPair()
    /*
     * `acceptWebSocket` et non `accept` : la connexion survit à la mise en
     * sommeil de l'objet. Une salle inactive quitte la mémoire sans que les
     * téléphones perdent leur lien, et se réveille au message suivant avec
     * son état. C'est ce qui rend une partie qui traîne gratuite.
     */
    this.ctx.acceptWebSocket(paire[1])

    return new Response(null, { status: 101, webSocket: paire[0] })
  }

  async webSocketMessage(ws: WebSocket, brut: string | ArrayBuffer) {
    if (typeof brut !== 'string') return

    let message: MessageClient
    try {
      message = JSON.parse(brut) as MessageClient
    } catch {
      return this.refuser(ws, 'refus', 'message illisible')
    }

    const partie = await this.lire()
    // Tout message est un signe de vie : la salle recule son oubli.
    partie.oubli = Date.now() + OUBLI_MS

    if (message.type === 'rejoindre') return this.rejoindre(ws, message, partie)

    const attache = ws.deserializeAttachment() as Attache | null
    if (!attache) return this.refuser(ws, 'refus', 'salle non rejointe')

    switch (message.type) {
      case 'equipe':
        return this.recevoirEquipe(ws, attache.side, message.battlers, partie)
      case 'action':
        return this.recevoirAction(ws, attache.side, message, partie)
      case 'remplacement':
        return this.recevoirRemplacement(attache.side, message, partie)
      case 'revanche':
        return this.revanche(partie)
      case 'nouvelles-equipes':
        return this.nouvellesEquipes(partie)
      default:
        return this.refuser(ws, 'refus', 'message inconnu')
    }
  }

  async webSocketClose(ws: WebSocket) {
    const attache = ws.deserializeAttachment() as Attache | null
    if (!attache) return

    const partie = await this.lire()
    const joueur = partie.joueurs[attache.side]
    // Une socket remplacée depuis n'a plus rien à dire de la présence du
    // joueur : c'est la connexion courante qui fait foi.
    if (!joueur || joueur.session !== attache.session) return

    joueur.connecte = false

    /*
     * Le minuteur ne court que s'il reste quelqu'un pour en profiter :
     * jouer des coups automatiques dans une salle vide ne ferait qu'user
     * une partie que personne ne regarde.
     */
    if (partie.joueurs.every((j) => !j?.connecte)) partie.echeance = null

    await this.ecrire(partie)
    await this.armer(partie)
    this.diffuserSalle(partie)
  }

  /**
   * Le réveil de la salle sert deux choses : la fin d'un délai de réflexion,
   * et l'oubli d'une salle abandonnée. Un objet durable n'a qu'une alarme —
   * on la pose donc sur la plus proche des deux, et `alarm` démêle.
   */
  private armer(partie: Partie) {
    const prochain = Math.min(partie.echeance ?? Number.POSITIVE_INFINITY, partie.oubli)
    return this.ctx.storage.setAlarm(prochain)
  }

  async alarm() {
    const partie = await this.lire()
    const maintenant = Date.now()

    if (partie.echeance !== null && maintenant >= partie.echeance) {
      return this.tempsEcoule(partie)
    }

    if (maintenant >= partie.oubli) return this.ctx.storage.deleteAll()

    return this.armer(partie)
  }

  /**
   * Le délai est passé : l'arbitre joue pour qui n'a pas choisi.
   *
   * Il joue **le coup du Dresseur**, pas un coup au hasard : c'est le même
   * module que le mode solo, et il n'a besoin que de l'état et de la table
   * des types. Un tirage aléatoire serait plus punitif sans être plus juste,
   * et laisserait le combat s'enliser sur des attaques sans effet.
   */
  private async tempsEcoule(partie: Partie) {
    const etat = partie.etat
    if (!etat || etat.winner !== null) {
      partie.echeance = null
      await this.ecrire(partie)
      return this.armer(partie)
    }

    const automatiques: Side[] = []

    // Un remplacement en attente passe avant tout : tant qu'un camp est à
    // terre, aucun coup ne peut être résolu.
    for (const side of [0, 1] as Side[]) {
      if (!doitRemplacer(etat, side)) continue
      automatiques.push(side)
      const resultat = remplacer(etat, side, choisirRemplacantIA(etat, side, CHART))
      partie.etat = resultat.etat
      await this.conclure(partie, resultat.events, automatiques)
      return
    }

    const actions: [Action, Action] = [
      partie.enAttente[0] ?? this.coupDArbitre(etat, 0, automatiques),
      partie.enAttente[1] ?? this.coupDArbitre(etat, 1, automatiques),
    ]

    const resultat = resoudreTour(etat, actions, CHART)
    partie.etat = resultat.etat
    partie.enAttente = [null, null]
    await this.conclure(partie, resultat.events, automatiques)
  }

  private coupDArbitre(etat: BattleState, side: Side, automatiques: Side[]): Action {
    automatiques.push(side)
    return choisirActionIA(etat, side, CHART)
  }

  /* ---------------------------------------------------------------- *
   * Les messages
   * ---------------------------------------------------------------- */

  private async rejoindre(
    ws: WebSocket,
    message: Extract<MessageClient, { type: 'rejoindre' }>,
    partie: Partie,
  ) {
    if (message.protocole !== PROTOCOLE) {
      return this.refuser(ws, 'protocole', `arbitre en v${PROTOCOLE}`)
    }

    const nom = String(message.nom ?? '').slice(0, 20)
    const jeton = String(message.jeton ?? '')
    if (!jeton) return this.refuser(ws, 'refus', 'jeton manquant')

    /*
     * On reprend d'abord sa place. Sans le jeton, un joueur qui recharge
     * sa page prendrait le camp resté libre — celui de l'adversaire — et
     * jouerait avec son équipe.
     */
    let side = partie.joueurs.findIndex((j) => j?.jeton === jeton) as Side | -1
    if (side === -1) side = partie.joueurs.findIndex((j) => j === null) as Side | -1
    if (side === -1) return this.refuser(ws, 'pleine')

    const existant = partie.joueurs[side]
    const session = (existant?.session ?? 0) + 1
    partie.joueurs[side] = {
      jeton,
      nom: nom || existant?.nom || `Joueur ${side + 1}`,
      equipe: existant?.equipe ?? null,
      connecte: true,
      session,
    }

    ws.serializeAttachment({ side, session } satisfies Attache)

    // La connexion précédente de ce camp n'a plus lieu d'être : un onglet
    // laissé ouvert ne doit pas recevoir la partie en double.
    for (const autre of this.ctx.getWebSockets()) {
      if (autre === ws) continue
      const marque = autre.deserializeAttachment() as Attache | null
      if (marque?.side === side && marque.session < session) autre.close(1000, 'remplacée')
    }
    await this.ecrire(partie)

    /*
     * Le minuteur s'était arrêté faute de public : il repart avec le
     * premier revenant, et pas avant — sinon la fenêtre aurait expiré
     * pendant l'absence, et le retour se ferait sur un coup déjà joué.
     */
    if (partie.etat && partie.etat.winner === null && partie.echeance === null) {
      partie.echeance = Date.now() + DELAI_TOUR_MS
      await this.ecrire(partie)
    }
    await this.armer(partie)

    this.envoyer(ws, { type: 'salle', salle: this.vueDe(partie, side) })
    // Une partie déjà commencée se retrouve telle quelle : c'est l'arbitre
    // qui tient l'état, le téléphone n'en est qu'un afficheur.
    if (partie.etat) {
      this.envoyer(ws, { type: 'debut', etat: partie.etat, echeance: partie.echeance })
    }

    this.diffuserSalle(partie)
  }

  private async recevoirEquipe(ws: WebSocket, side: Side, battlers: Battler[], partie: Partie) {
    if (partie.etat) return
    if (!equipeAcceptable(battlers)) return this.refuser(ws, 'refus', 'équipe invalide')

    const joueur = partie.joueurs[side]
    if (!joueur) return
    joueur.equipe = battlers

    const [un, deux] = partie.joueurs
    if (un?.equipe && deux?.equipe) {
      /*
       * La graine est tirée **ici**. Sur un téléphone, celui qui la
       * connaîtrait saurait à l'avance quels coups seront critiques et
       * choisirait en conséquence.
       */
      partie.etat = creerCombat([un.equipe, deux.equipe], (Math.random() * 0xffffffff) >>> 0)
      partie.echeance = Date.now() + DELAI_TOUR_MS
      await this.ecrire(partie)
      await this.armer(partie)
      this.diffuser({ type: 'debut', etat: partie.etat, echeance: partie.echeance })
      return
    }

    await this.ecrire(partie)
    this.diffuserSalle(partie)
  }

  /**
   * Diffuse un tour résolu et rouvre la fenêtre de décision.
   *
   * Un seul chemin pour les trois cas — coup normal, remplacement, coup
   * joué par l'arbitre — sinon le délai finirait par être posé dans deux
   * branches sur trois, et le troisième cas bloquerait la partie.
   */
  private async conclure(partie: Partie, evenements: BattleEvent[], automatiques: Side[]) {
    const etat = partie.etat!
    partie.echeance =
      etat.winner === null
        ? Date.now() + DELAI_TOUR_MS + evenements.length * MARGE_RECIT_MS
        : null

    await this.ecrire(partie)
    await this.armer(partie)
    this.diffuser({
      type: 'tour',
      etat,
      evenements,
      echeance: partie.echeance,
      automatiques,
    })
  }

  private async recevoirAction(
    ws: WebSocket,
    side: Side,
    message: Extract<MessageClient, { type: 'action' }>,
    partie: Partie,
  ) {
    const etat = partie.etat
    // Un coup daté d'un autre tour est un double envoi ou un retardataire.
    if (!etat || etat.winner !== null || message.tour !== etat.turn) return
    // Tant qu'un camp doit envoyer un remplaçant, personne n'attaque.
    if (doitRemplacer(etat, 0) || doitRemplacer(etat, 1)) return

    const action = message.action
    if (!action || (action.kind !== 'move' && action.kind !== 'switch')) {
      return this.refuser(ws, 'refus', 'action inconnue')
    }

    partie.enAttente[side] = action

    const autre = (1 - side) as Side
    const attendu = partie.enAttente[autre]
    if (!attendu) {
      await this.ecrire(partie)
      return this.envoyer(ws, { type: 'attente', tour: etat.turn })
    }

    const actions: [Action, Action] =
      side === 0 ? [action, attendu] : [attendu, action]

    const resultat = resoudreTour(etat, actions, CHART)
    partie.etat = resultat.etat
    partie.enAttente = [null, null]
    await this.conclure(partie, resultat.events, [])
  }

  private async recevoirRemplacement(
    side: Side,
    message: Extract<MessageClient, { type: 'remplacement' }>,
    partie: Partie,
  ) {
    const etat = partie.etat
    if (!etat || message.tour !== etat.turn) return
    // Seul le camp dont le Pokémon est à terre peut en envoyer un autre.
    if (!doitRemplacer(etat, side)) return

    const resultat = remplacer(etat, side, message.index)
    if (resultat.events.length === 0) return

    partie.etat = resultat.etat
    await this.conclure(partie, resultat.events, [])
  }

  private async revanche(partie: Partie) {
    const [un, deux] = partie.joueurs
    if (!un?.equipe || !deux?.equipe || !partie.etat || partie.etat.winner === null) return

    // Les équipes repartent neuves : les points de vie et les PP du combat
    // précédent vivaient dans l'état, pas dans les équipes conservées.
    partie.etat = creerCombat([un.equipe, deux.equipe], (Math.random() * 0xffffffff) >>> 0)
    partie.enAttente = [null, null]
    partie.echeance = Date.now() + DELAI_TOUR_MS
    await this.ecrire(partie)
    await this.armer(partie)
    this.diffuser({ type: 'debut', etat: partie.etat, echeance: partie.echeance })
  }

  /**
   * Les deux repartent de la sélection, dans la même salle.
   *
   * Les équipes sont rendues à leurs propriétaires — c'est-à-dire effacées
   * ici : c'est le téléphone qui recomposera, et l'arbitre n'a pas à se
   * souvenir de ce qu'il ne lui a pas encore été redemandé.
   */
  private async nouvellesEquipes(partie: Partie) {
    if (!partie.etat || partie.etat.winner === null) return

    for (const joueur of partie.joueurs) if (joueur) joueur.equipe = null
    partie.etat = null
    partie.enAttente = [null, null]
    partie.echeance = null

    await this.ecrire(partie)
    await this.armer(partie)
    this.diffuser({ type: 'nouvelle-partie' })
    this.diffuserSalle(partie)
  }

  /* ---------------------------------------------------------------- *
   * Plomberie
   * ---------------------------------------------------------------- */

  private vueDe(partie: Partie, side: Side): EtatSalle {
    const moi = partie.joueurs[side]
    const autre = partie.joueurs[(1 - side) as Side]

    return {
      moi: side,
      nomAdverse: autre?.nom ?? null,
      adversaireConnecte: Boolean(autre?.connecte),
      equipeEnvoyee: Boolean(moi?.equipe),
      adversairePret: Boolean(autre?.equipe),
    }
  }

  /** Chaque téléphone reçoit **sa** vue : elle n'est pas la même des deux côtés. */
  private diffuserSalle(partie: Partie) {
    for (const ws of this.ctx.getWebSockets()) {
      const attache = ws.deserializeAttachment() as Attache | null
      if (!attache) continue
      this.envoyer(ws, { type: 'salle', salle: this.vueDe(partie, attache.side) })
    }
  }

  private diffuser(message: MessageServeur) {
    for (const ws of this.ctx.getWebSockets()) this.envoyer(ws, message)
  }

  private envoyer(ws: WebSocket, message: MessageServeur) {
    try {
      ws.send(JSON.stringify(message))
    } catch {
      // Connexion déjà fermée : le `close` fera le ménage.
    }
  }

  private refuser(ws: WebSocket, raison: RaisonErreur, detail?: string) {
    this.envoyer(ws, { type: 'erreur', raison, detail })
    if (raison !== 'refus') ws.close(1008, raison)
  }

  private async lire(): Promise<Partie> {
    const partie = await this.ctx.storage.get<Partie>('partie')
    return partie ?? structuredClone(VIDE)
  }

  private ecrire(partie: Partie) {
    return this.ctx.storage.put('partie', partie)
  }
}
