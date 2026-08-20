import { useCallback, useEffect, useRef, useState } from 'react'
import { PROTOCOLE, adresseArbitre } from '@/lib/battle/protocole'
import type {
  EtatSalle,
  MessageClient,
  MessageServeur,
  RaisonErreur,
} from '@/lib/battle/protocole'
import type { BattleEvent, BattleState } from '@/lib/battle/types'

/**
 * Adresse de l'arbitre, injectée à la construction.
 *
 * En développement, `wrangler dev` sert l'objet durable sur le port 8787 :
 * le combat en ligne se teste donc entièrement en local, sans rien
 * déployer. En production, la variable est posée sur l'hébergeur.
 *
 * Le repli local **ne vaut qu'en développement** : en production il
 * enverrait le téléphone frapper à sa propre porte, et l'écran resterait
 * sur « Connexion… » sans jamais dire pourquoi. Mieux vaut annoncer que le
 * mode n'est pas configuré.
 */
const brut: string | undefined = import.meta.env.VITE_ARBITRE
const ARBITRE: string | null = brut
  ? adresseArbitre(brut)
  : import.meta.env.DEV
    ? 'ws://localhost:8787'
    : null

/** Le jeton identifie l'appareil, pas le joueur : il sert à retrouver son camp. */
const CLE_JETON = 'pokedex:jeton'

function jetonDeCetAppareil(): string {
  try {
    const connu = localStorage.getItem(CLE_JETON)
    if (connu) return connu
    const neuf = crypto.randomUUID()
    localStorage.setItem(CLE_JETON, neuf)
    return neuf
  } catch {
    // Stockage refusé : un jeton de session suffit, on perdra seulement la
    // reprise après rechargement.
    return crypto.randomUUID()
  }
}

/** Attente entre deux tentatives, doublée à chaque échec. */
const REPRISE_MIN = 1000
const REPRISE_MAX = 10_000

export type Ecoutes = {
  onDebut: (etat: BattleState) => void
  onTour: (etat: BattleState, evenements: BattleEvent[]) => void
}

export type Salle = {
  /** Faux si l'application n'a pas d'adresse d'arbitre : rien n'est jouable. */
  configuree: boolean
  connecte: boolean
  etat: EtatSalle | null
  erreur: { raison: RaisonErreur; detail?: string } | null
  /** Vrai entre l'envoi d'un coup et la réponse de l'arbitre. */
  enAttenteDAdversaire: boolean
  /**
   * Rend **faux** si le message n'est pas parti — socket fermée, ou en
   * cours de rétablissement. L'appelant doit s'en servir : un envoi perdu
   * compté comme réussi laisse la partie en plan, sans rien à l'écran qui
   * dise qu'il faut recommencer.
   */
  envoyer: (message: MessageClient) => boolean
}

/**
 * Le lien avec l'arbitre.
 *
 * Une seule socket, rouverte toute seule tant que la salle existe : sur un
 * téléphone, l'onglet passe en arrière-plan à la moindre notification et le
 * système ferme la connexion sans prévenir. Une partie ne doit pas mourir
 * parce qu'on a regardé l'heure.
 *
 * Le hook ne connaît rien au combat : il transporte des messages et publie
 * l'état de la salle. Ce qui arrive du réseau est remis à `useCombat` par
 * les deux écoutes, jamais recalculé ici.
 */
export function useSalle(code: string | null, nom: string, ecoutes: Ecoutes): Salle {
  const [connecte, setConnecte] = useState(false)
  const [etat, setEtat] = useState<EtatSalle | null>(null)
  const [erreur, setErreur] = useState<Salle['erreur']>(null)
  const [enAttenteDAdversaire, setEnAttente] = useState(false)

  const socket = useRef<WebSocket | null>(null)
  const minuteur = useRef(0)
  const delai = useRef(REPRISE_MIN)
  /*
   * Les écoutes changent à chaque rendu — ce sont des fermetures sur l'état
   * du combat. Les mettre dans les dépendances rouvrirait la socket à
   * chaque tour ; on garde donc la dernière version sous la main.
   */
  const dernieres = useRef(ecoutes)
  dernieres.current = ecoutes

  const nomRef = useRef(nom)
  nomRef.current = nom

  useEffect(() => {
    if (!code || !ARBITRE) return

    let vivant = true

    const brancher = () => {
      if (!vivant) return

      const ws = new WebSocket(`${ARBITRE}/${code}`)
      socket.current = ws

      ws.onopen = () => {
        // Une socket que le montage suivant a déjà remplacée n'a plus rien
        // à faire dans la salle : elle se ferme sans se présenter.
        if (socket.current !== ws) {
          ws.close()
          return
        }

        delai.current = REPRISE_MIN
        setConnecte(true)
        setErreur(null)
        ws.send(
          JSON.stringify({
            type: 'rejoindre',
            protocole: PROTOCOLE,
            jeton: jetonDeCetAppareil(),
            nom: nomRef.current,
          } satisfies MessageClient),
        )
      }

      ws.onmessage = (evenement) => {
        if (socket.current !== ws) return

        let message: MessageServeur
        try {
          message = JSON.parse(String(evenement.data)) as MessageServeur
        } catch {
          return
        }

        switch (message.type) {
          case 'salle':
            setEtat(message.salle)
            return
          case 'debut':
            setEnAttente(false)
            dernieres.current.onDebut(message.etat)
            return
          case 'attente':
            setEnAttente(true)
            return
          case 'tour':
            setEnAttente(false)
            dernieres.current.onTour(message.etat, message.evenements)
            return
          case 'erreur':
            setErreur({ raison: message.raison, detail: message.detail })
            // Un refus ponctuel n'interrompt pas la partie ; les deux autres
            // sont définitifs et l'arbitre ferme derrière lui.
            if (message.raison !== 'refus') vivant = false
            return
        }
      }

      ws.onclose = () => {
        /*
         * Le même piège que côté arbitre, en miroir : la fermeture d'une
         * socket **déjà remplacée** arrive après l'ouverture de la
         * suivante. Sans cette garde, elle effaçait la connexion courante —
         * l'application se croyait branchée, et tout ce qu'elle envoyait
         * tombait dans le vide sans un mot.
         */
        if (socket.current !== ws) return

        socket.current = null
        setConnecte(false)
        if (!vivant) return

        minuteur.current = window.setTimeout(brancher, delai.current)
        delai.current = Math.min(REPRISE_MAX, delai.current * 2)
      }

      // `onclose` suit toujours une erreur de socket : c'est lui qui replanifie.
      ws.onerror = () => ws.close()
    }

    brancher()

    /*
     * Un onglet qui revient au premier plan retrouve souvent une socket que
     * le système a fermée pendant son absence, sans que `onclose` ait été
     * livré. On vérifie donc à chaque retour plutôt que de faire confiance.
     */
    const auRetour = () => {
      if (document.visibilityState !== 'visible') return
      const ouverte = socket.current?.readyState === WebSocket.OPEN
      if (!ouverte && vivant) {
        window.clearTimeout(minuteur.current)
        brancher()
      }
    }
    document.addEventListener('visibilitychange', auRetour)

    return () => {
      vivant = false
      window.clearTimeout(minuteur.current)
      document.removeEventListener('visibilitychange', auRetour)
      const courante = socket.current
      socket.current = null
      courante?.close()
    }
  }, [code])

  const envoyer = useCallback((message: MessageClient) => {
    const ws = socket.current
    if (ws?.readyState !== WebSocket.OPEN) return false
    ws.send(JSON.stringify(message))
    return true
  }, [])

  return {
    configuree: Boolean(ARBITRE),
    connecte,
    etat,
    erreur,
    enAttenteDAdversaire,
    envoyer,
  }
}
