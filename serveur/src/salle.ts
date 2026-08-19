import { DurableObject } from 'cloudflare:workers'
import { creerCombat, doitRemplacer, remplacer, resoudreTour } from '../../src/lib/battle/engine'
import { PROTOCOLE, equipeAcceptable } from '../../src/lib/battle/protocole'
import type {
  EtatSalle,
  MessageClient,
  MessageServeur,
  RaisonErreur,
} from '../../src/lib/battle/protocole'
import type { Action, BattleState, Battler, Side } from '../../src/lib/battle/types'
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
}

const VIDE: Partie = { joueurs: [null, null], etat: null, enAttente: [null, null] }

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
    await this.ctx.storage.deleteAlarm()

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
    await this.ecrire(partie)
    this.diffuserSalle(partie)

    /*
     * Personne en ligne : la salle s'oubliera d'elle-même. Le réveil est
     * annulé dès qu'une connexion revient — un rechargement de page ne doit
     * pas coûter la partie.
     */
    if (partie.joueurs.every((j) => !j?.connecte)) {
      await this.ctx.storage.setAlarm(Date.now() + OUBLI_MS)
    }
  }

  async alarm() {
    await this.ctx.storage.deleteAll()
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

    this.envoyer(ws, { type: 'salle', salle: this.vueDe(partie, side) })
    // Une partie déjà commencée se retrouve telle quelle : c'est l'arbitre
    // qui tient l'état, le téléphone n'en est qu'un afficheur.
    if (partie.etat) this.envoyer(ws, { type: 'debut', etat: partie.etat })

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
      await this.ecrire(partie)
      this.diffuser({ type: 'debut', etat: partie.etat })
      return
    }

    await this.ecrire(partie)
    this.diffuserSalle(partie)
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
    await this.ecrire(partie)

    this.diffuser({ type: 'tour', etat: resultat.etat, evenements: resultat.events })
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
    await this.ecrire(partie)
    this.diffuser({ type: 'tour', etat: resultat.etat, evenements: resultat.events })
  }

  private async revanche(partie: Partie) {
    const [un, deux] = partie.joueurs
    if (!un?.equipe || !deux?.equipe || !partie.etat || partie.etat.winner === null) return

    // Les équipes repartent neuves : les points de vie et les PP du combat
    // précédent vivaient dans l'état, pas dans les équipes conservées.
    partie.etat = creerCombat([un.equipe, deux.equipe], (Math.random() * 0xffffffff) >>> 0)
    partie.enAttente = [null, null]
    await this.ecrire(partie)
    this.diffuser({ type: 'debut', etat: partie.etat })
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
