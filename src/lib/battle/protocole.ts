import type { Action, BattleEvent, BattleState, Battler, Side } from './types'

/**
 * Ce que les deux téléphones et l'arbitre se disent.
 *
 * Un seul fichier, importé des trois côtés : le client par `@/`, l'arbitre
 * par un chemin relatif. Deux définitions du même message finiraient par
 * diverger, et une divergence de protocole ne se voit pas — elle se
 * constate, en pleine partie, sur un combat qui ne répond plus.
 */

/**
 * Version du dialogue.
 *
 * **À incrémenter dès qu'un message change de forme.** Le site se déploie
 * tout seul à chaque poussée sur `main` : deux joueurs peuvent parfaitement
 * ouvrir la même salle avec deux versions différentes de l'application. Un
 * refus net à la connexion vaut infiniment mieux qu'une partie qui part de
 * travers sans que personne comprenne pourquoi.
 */
export const PROTOCOLE = 1

/**
 * Alphabet des codes de salle : ni `0`/`O`, ni `1`/`I`/`L`. Un code se lit
 * à voix haute et se recopie à la main — les paires ambiguës sont la
 * première cause de « ça ne marche pas ».
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export const LONGUEUR_CODE = 4

export function codeAleatoire(): string {
  const tirage = new Uint32Array(LONGUEUR_CODE)
  crypto.getRandomValues(tirage)
  return [...tirage].map((n) => ALPHABET[n % ALPHABET.length]).join('')
}

/** Normalise ce qu'on tape : minuscules et espaces acceptés. */
export const normaliserCode = (brut: string) =>
  brut
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, LONGUEUR_CODE)

export const codeValide = (code: string) =>
  code.length === LONGUEUR_CODE && [...code].every((c) => ALPHABET.includes(c))

/* ------------------------------------------------------------------ *
 * Du téléphone vers l'arbitre
 * ------------------------------------------------------------------ */

export type MessageClient =
  /**
   * Toujours le premier message. Le jeton identifie l'appareil et non le
   * joueur : c'est lui qui permet de retrouver son camp après un
   * rechargement, là où une simple place « premier arrivé » donnerait le
   * camp de l'adversaire à celui qui revient.
   */
  | { type: 'rejoindre'; protocole: number; jeton: string; nom: string }
  /** Les trois combattants, déjà montés — l'arbitre n'a pas le dex. */
  | { type: 'equipe'; battlers: Battler[] }
  /** `tour` date le coup : un double envoi ou un message en retard est ignoré. */
  | { type: 'action'; tour: number; action: Action }
  | { type: 'remplacement'; tour: number; index: number }
  | { type: 'revanche' }

/* ------------------------------------------------------------------ *
 * De l'arbitre vers les téléphones
 * ------------------------------------------------------------------ */

export type EtatSalle = {
  /** Le camp attribué à cet appareil. */
  moi: Side
  nomAdverse: string | null
  adversaireConnecte: boolean
  /** Vrai une fois l'équipe de cet appareil reçue. */
  equipeEnvoyee: boolean
  adversairePret: boolean
}

export type MessageServeur =
  /** Réponse à `rejoindre`, et à chaque changement dans la salle. */
  | { type: 'salle'; salle: EtatSalle }
  /** Les deux équipes sont là : voici le combat, identique des deux côtés. */
  | { type: 'debut'; etat: BattleState }
  /** Le coup est enregistré ; on attend celui d'en face. */
  | { type: 'attente'; tour: number }
  /** Le tour a été résolu par l'arbitre : personne ne recalcule rien. */
  | { type: 'tour'; etat: BattleState; evenements: BattleEvent[] }
  | { type: 'erreur'; raison: RaisonErreur; detail?: string }

export type RaisonErreur =
  /** Les deux applications ne parlent pas la même langue. */
  | 'protocole'
  /** Deux joueurs occupent déjà la salle. */
  | 'pleine'
  /** Message inattendu ou équipe invalide : la salle refuse et le dit. */
  | 'refus'

export const TEXTE_ERREUR: Record<RaisonErreur, string> = {
  protocole:
    "Ton adversaire n'a pas la même version de l'application. Rechargez la page tous les deux.",
  pleine: 'Cette salle est déjà complète.',
  refus: "L'arbitre a refusé la partie.",
}

/* ------------------------------------------------------------------ *
 * Ce que l'arbitre vérifie avant d'accepter une équipe
 * ------------------------------------------------------------------ */

/** Nombre de combattants par équipe, redit ici : l'arbitre n'a que ce fichier. */
export const TAILLE_EQUIPE_RESEAU = 3
export const NB_ATTAQUES_MAX = 4

/**
 * Contrôle d'allure, pas d'honnêteté.
 *
 * L'arbitre reçoit des combattants tout montés : il ne peut pas recalculer
 * leurs statistiques sans embarquer le dex entier, donc il ne prouve pas
 * qu'ils sont légitimes. Il refuse ce qui est manifestement faux — une
 * équipe de six, des points de vie négatifs, dix attaques — et fait
 * confiance pour le reste.
 *
 * C'est un arbitrage assumé : entre amis qui partagent un code à quatre
 * lettres, le coût d'une vérification complète dépasse de loin le risque.
 * Ce qui compte est ailleurs — que **le tour** se calcule sur l'arbitre, et
 * pas sur le téléphone de l'adversaire.
 */
export function equipeAcceptable(battlers: unknown): battlers is Battler[] {
  if (!Array.isArray(battlers) || battlers.length !== TAILLE_EQUIPE_RESEAU) return false

  return battlers.every((b: Partial<Battler>) => {
    if (typeof b?.name !== 'string' || !Array.isArray(b.types) || b.types.length === 0) return false
    if (typeof b.maxHp !== 'number' || b.maxHp <= 0 || b.maxHp > 1000) return false
    if (b.hp !== b.maxHp) return false
    if (!b.stats || typeof b.stats.speed !== 'number') return false
    if (!Array.isArray(b.moves) || b.moves.length === 0 || b.moves.length > NB_ATTAQUES_MAX) {
      return false
    }
    return b.moves.every((slot) => typeof slot?.pp === 'number' && slot.pp === slot.maxPp)
  })
}
