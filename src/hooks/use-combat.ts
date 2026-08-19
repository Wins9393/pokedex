import { useCallback, useEffect, useMemo, useState } from 'react'
import { useBattleForms } from '@/hooks/use-forms'
import { useMoves, useMovesets } from '@/hooks/use-moves'
import { useNomsJoueurs } from '@/hooks/use-noms-joueurs'
import { usePokedex } from '@/hooks/use-pokedex'
import {
  actif,
  creerBattler,
  creerCombat,
  prochainEcran,
  remplacer,
  resoudreTour,
} from '@/lib/battle/engine'
import { choisirActionIA, choisirRemplacantIA, composerEquipeIA } from '@/lib/battle/ia'
import { texteEvenement } from '@/lib/battle/log'
import { passagePour } from '@/lib/battle/modes'
import { NOMS_PAR_DEFAUT } from '@/lib/battle/noms'
import { graineAleatoire } from '@/lib/battle/rng'
import { ecrire, effacer, lire, reprendre } from '@/lib/battle/save'
import type {
  Action,
  BattleEvent,
  BattleState,
  Choix,
  Ecran,
  Mode,
  Passage,
  Side,
  Team,
} from '@/lib/battle/types'

/** Le nom de l'adversaire automatique, à la place du pseudo du joueur 2. */
const NOM_IA = 'Dresseur'

/**
 * Rejoue un événement sur l'état affiché. L'interface ne saute pas
 * directement à l'état final du tour : elle le reconstruit pas à pas, ce
 * qui fait descendre les barres de vie au moment où la phrase
 * correspondante s'affiche.
 */
function appliquer(etat: BattleState, event: BattleEvent): BattleState {
  if (event.kind === 'switch') {
    const teams = [...etat.teams] as [Team, Team]
    teams[event.side] = { ...teams[event.side], active: event.toIndex }
    return { ...etat, teams }
  }

  if (event.kind === 'damage') {
    const cible = (1 - event.side) as Side
    const equipe = etat.teams[cible]
    const teams = [...etat.teams] as [Team, Team]
    teams[cible] = {
      ...equipe,
      battlers: equipe.battlers.map((battler, index) =>
        index === equipe.active ? { ...battler, hp: event.hp } : battler,
      ),
    }
    return { ...etat, teams }
  }

  return etat
}

/**
 * La partie, hors de l'écran qui la montre.
 *
 * Ce découpage est la condition du mode en ligne. La page mélangeait deux
 * métiers : elle affichait le combat **et** l'arbitrait — c'est elle qui
 * gardait le choix du joueur 1 puis appelait `resoudreTour`. Tant que
 * l'arbitrage vivait dans le rendu, jouer contre une machine ou contre un
 * autre téléphone demandait de réécrire la page.
 *
 * Ici, un seul endroit répond aux trois questions qui changent avec le
 * mode : d'où vient l'équipe adverse, d'où vient son action, et où le tour
 * se calcule. Tout le reste — le récit rejoué au rythme du joueur, les
 * jauges, la sauvegarde — est commun aux trois.
 */
export function useCombat(mode: Mode) {
  const { pokemon, byId, chart, isPending, isError, error, refetch } = usePokedex()
  const { noms: pseudos } = useNomsJoueurs()
  const { byId: movesById, isPending: movesPending, isError: movesError } = useMoves()
  /*
   * Les formes ne bloquent pas le combat : sans la table, la sélection ne
   * propose que les espèces par défaut et tout le reste fonctionne. Les
   * attendre ferait dépendre un mode entier d'une requête accessoire.
   */
  const { parEspece: formesParEspece } = useBattleForms(byId)

  /*
   * En solo, le second pseudo n'a personne à désigner : l'adversaire n'est
   * pas un joueur, et lui coller le nom enregistré ferait dire au journal
   * qu'une amie absente vient de nous mettre K.O.
   */
  const noms = useMemo(
    () => (mode === 'ia' ? ([pseudos[0] || NOMS_PAR_DEFAUT[0], NOM_IA] as const) : pseudos),
    [mode, pseudos],
  )

  /*
   * La partie sauvegardée, lue une seule fois au montage.
   *
   * `localStorage` est synchrone, et c'est précisément ce qu'on veut ici :
   * l'état est là dès le premier rendu. Avec IndexedDB — le stockage retenu
   * pour le dex, parce que les fiches n'y tenaient pas — il faudrait un
   * écran d'attente, et le sélecteur d'équipe apparaîtrait une fraction de
   * seconde avant que le combat ne revienne.
   *
   * Une seule partie est gardée, et elle appartient à son mode : ouvrir le
   * solo ne doit pas rendre la main au milieu d'une partie à deux.
   */
  const [reprise] = useState(() => {
    const sauve = lire()
    return sauve && sauve.mode === mode ? { sauve, ...reprendre(sauve) } : null
  })

  /*
   * Les deux équipes sont stockées séparément, et `equipes` n'existe que
   * lorsque les deux sont complètes. Conserver un couple à moitié rempli
   * ferait démarrer la construction du combat dès le premier joueur, avec
   * une équipe adverse vide.
   */
  const [equipe1, setEquipe1] = useState<Choix[] | null>(reprise?.sauve.equipe1 ?? null)
  const [equipe2, setEquipe2] = useState<Choix[] | null>(reprise?.sauve.equipe2 ?? null)
  const equipes = useMemo(
    () => (equipe1 && equipe2 ? ([equipe1, equipe2] as [Choix[], Choix[]]) : null),
    [equipe1, equipe2],
  )

  const [etat, setEtat] = useState<BattleState | null>(reprise?.sauve.etat ?? null)
  const [affiche, setAffiche] = useState<BattleState | null>(reprise?.sauve.etat ?? null)

  const [ecran, setEcran] = useState<Ecran>(reprise?.ecran ?? { kind: 'equipe', joueur: 1 })
  const [passage, setPassage] = useState<Passage | null>(reprise?.passage ?? null)

  const [enAttente, setEnAttente] = useState<Action | null>(null)
  /**
   * Le récit du tour, et l'étape à l'écran. Le rejeu n'avance pas au
   * chronomètre mais à la tape : le joueur vient de découvrir la réponse de
   * l'adversaire, il lui faut le temps de la lire.
   */
  const [evenements, setEvenements] = useState<BattleEvent[]>([])
  const [curseur, setCurseur] = useState(0)
  /*
   * Le récit n'est pas sauvegardé : à la reprise il n'y a aucune réplique à
   * réafficher, et le repli d'origine — « Le combat commence ! » — mentirait
   * sur une partie retrouvée au huitième tour.
   */
  const [message, setMessage] = useState<string | null>(
    reprise?.sauve.etat ? 'Reprise du combat.' : null,
  )
  const [impact, setImpact] = useState<Side | null>(null)

  /*
   * On demande les capacités de l'espèce **et** de la forme retenue. Les
   * deux sont nécessaires : le vivier propre à une forme est souvent
   * incomplet — 50 des 219 formes jouables n'en ont aucun dans l'API, dont
   * toutes les Méga de Legends Z-A — mais 32 sont les seules à porter une
   * attaque de leur nouveau type, comme les formes d'Alola.
   */
  const idsEquipes = useMemo(() => {
    // Un combat repris porte déjà ses combattants tout montés — types,
    // statistiques et quatre attaques comprises. La reprise ne redemande
    // donc rien au réseau.
    if (!equipes || etat) return []
    const ids = [...equipes[0], ...equipes[1]].flatMap((choix) =>
      choix.formId ? [choix.speciesId, choix.formId] : [choix.speciesId],
    )
    return [...new Set(ids)]
  }, [equipes, etat])

  const {
    movesets,
    isError: movesetsError,
    refetch: rechargerCapacites,
  } = useMovesets(idsEquipes)

  /* --- Enchaînement après un tour ou un remplacement ---------------- */
  const enchainer = useCallback(
    (courant: BattleState) => {
      const suivant = prochainEcran(courant)
      const relais = passagePour(suivant, mode)
      /*
       * Avec un passage, l'écran courant reste dessous jusqu'à la tape :
       * c'est lui qui révélera l'écran suivant. Sans passage — la fin du
       * combat, ou un mode où personne ne se passe le téléphone — on y va
       * directement.
       */
      if (relais) setPassage(relais)
      else setEcran(suivant)
    },
    [mode],
  )

  /* --- Construction du combat une fois les capacités reçues --------- */
  useEffect(() => {
    if (etat || !equipes || !movesets || !movesById || !byId) return

    const monter = (choisis: Choix[]) =>
      choisis.flatMap((choix) => {
        const summary = byId.get(choix.speciesId)
        if (!summary) return []

        const forme = choix.formId
          ? (formesParEspece?.get(choix.speciesId)?.find((f) => f.id === choix.formId) ?? null)
          : null

        const apprises = [
          ...new Set([
            ...(movesets[choix.speciesId] ?? []),
            ...(choix.formId ? (movesets[choix.formId] ?? []) : []),
          ]),
        ]

        return [creerBattler(summary, forme, choix.shiny, apprises, movesById)]
      })

    const combat = creerCombat([monter(equipes[0]), monter(equipes[1])], graineAleatoire())
    setEtat(combat)
    setAffiche(combat)

    const debut: Ecran = { kind: 'choix', side: 0 }
    const relais = passagePour(debut, mode)
    if (relais) setPassage({ ...relais, detail: 'Le combat commence !' })
    else setEcran(debut)
  }, [etat, equipes, movesets, movesById, byId, formesParEspece, mode])

  /* --- Sauvegarde de la partie -------------------------------------- */
  useEffect(() => {
    // Avant l'équipe du joueur 1, il n'y a rien à retenir.
    if (!equipe1) return
    ecrire({ mode, equipe1, equipe2, etat, ecran, passage })
  }, [mode, equipe1, equipe2, etat, ecran, passage])

  /* --- Rejeu du récit, au rythme du joueur -------------------------- */
  useEffect(() => {
    if (ecran.kind !== 'replay') return

    const event = evenements[curseur]
    if (!event) return

    // Les dégâts n'ont pas de phrase : la ligne précédente reste affichée
    // pendant que la jauge se vide, comme dans les jeux.
    const texte = texteEvenement(event, noms)
    if (texte) setMessage(texte)

    setAffiche((precedent) => (precedent ? appliquer(precedent, event) : precedent))
    setImpact(event.kind === 'damage' ? ((1 - event.side) as Side) : null)
  }, [ecran, curseur, evenements, noms])

  /** Une tape fait avancer d'un événement, et clôt le rejeu au dernier. */
  const avancerRecit = useCallback(() => {
    /*
     * La surface reste montée sous l'écran de passage, qui la recouvre
     * entièrement. Un doigt ne peut donc plus l'atteindre — mais le clavier,
     * lui, le peut : sans cette garde, une barre d'espace de trop reposerait
     * l'écran de passage déjà en place.
     */
    if (!etat || passage) return

    if (curseur + 1 < evenements.length) {
      setCurseur((valeur) => valeur + 1)
      return
    }

    // Resynchronisation complète : le rejeu ne reconstitue que les PV et
    // les changements, pas les PP consommés.
    setAffiche(etat)
    setImpact(null)
    enchainer(etat)
  }, [curseur, evenements.length, etat, passage, enchainer])

  /* --- Résolution d'un tour ----------------------------------------- */
  const resoudre = useCallback(
    (courant: BattleState, actions: [Action, Action]) => {
      if (!chart) return
      const resultat = resoudreTour(courant, actions, chart)

      setAffiche(courant)
      setEtat(resultat.etat)
      setEvenements(resultat.events)
      setCurseur(0)
      setEnAttente(null)
      setEcran({ kind: 'replay' })
    },
    [chart],
  )

  /* --- Actions ------------------------------------------------------- */
  const choisirEquipe = useCallback(
    (choisis: Choix[]) => {
      if (ecran.kind !== 'equipe') return

      if (ecran.joueur === 2) {
        setEquipe2(choisis)
        return
      }

      setEquipe1(choisis)

      /*
       * En solo, l'adversaire compose la sienne dans la foulée, en miroir
       * de celle qu'on vient de valider. Il n'y a donc pas de second écran
       * de sélection, et le combat démarre dès que les capacités arrivent.
       */
      if (mode === 'ia') {
        if (pokemon) setEquipe2(composerEquipeIA(pokemon, choisis, graineAleatoire()))
        return
      }

      const suivant: Ecran = { kind: 'equipe', joueur: 2 }
      const relais = passagePour(suivant, mode)
      if (relais) setPassage(relais)
      else setEcran(suivant)
    },
    [ecran, mode, pokemon],
  )

  const choisirAction = useCallback(
    (action: Action) => {
      if (ecran.kind !== 'choix' || !etat || !chart) return

      if (mode === 'ia') {
        // Les deux choix sont simultanés : l'adversaire décide sur l'état
        // d'avant le tour, sans voir celui du joueur.
        resoudre(etat, [action, choisirActionIA(etat, 1, chart)])
        return
      }

      if (ecran.side === 0) {
        setEnAttente(action)
        const suivant: Ecran = { kind: 'choix', side: 1 }
        const relais = passagePour(suivant, mode)
        if (relais) setPassage(relais)
        else setEcran(suivant)
        return
      }

      resoudre(etat, [enAttente ?? { kind: 'move', slot: 0 }, action])
    },
    [ecran, etat, chart, mode, enAttente, resoudre],
  )

  const choisirRemplacant = useCallback(
    (index: number) => {
      if (ecran.kind !== 'remplacement' || !etat) return

      const resultat = remplacer(etat, ecran.side, index)
      const premier = resultat.events[0]

      setEtat(resultat.etat)
      setAffiche(resultat.etat)
      if (premier) setMessage(texteEvenement(premier, noms))
      enchainer(resultat.etat)
    },
    [ecran, etat, noms, enchainer],
  )

  /* --- L'adversaire automatique envoie son remplaçant --------------- */
  useEffect(() => {
    if (mode !== 'ia' || !etat || !chart) return
    if (ecran.kind !== 'remplacement' || ecran.side !== 1) return

    const index = choisirRemplacantIA(etat, 1, chart)
    const resultat = remplacer(etat, 1, index)
    const premier = resultat.events[0]

    setEtat(resultat.etat)
    setAffiche(resultat.etat)
    if (premier) setMessage(texteEvenement(premier, noms))
    enchainer(resultat.etat)
  }, [mode, etat, chart, ecran, noms, enchainer])

  const rejouer = useCallback(
    (memesEquipes: boolean) => {
      // La partie sauvegardée disparaît d'abord : sans péremption, c'est
      // « Rejouer » et « Quitter » qui la libèrent, et rien d'autre.
      effacer()
      setEtat(null)
      setAffiche(null)
      setEvenements([])
      setCurseur(0)
      setMessage(null)
      setImpact(null)
      setEnAttente(null)
      setPassage(null)

      if (memesEquipes) {
        // Rien d'autre à faire : `etat` repassé à null réveille l'effet de
        // construction, qui remonte les équipes et repose l'écran de départ.
        setEcran({ kind: 'choix', side: 0 })
      } else {
        setEquipe1(null)
        setEquipe2(null)
        setEcran({ kind: 'equipe', joueur: 1 })
      }
    },
    [],
  )

  const franchirPassage = useCallback(() => {
    if (!passage) return
    setEcran(passage.ecran)
    setPassage(null)
  }, [passage])

  /*
   * Les deux équipes sont composées : la sélection n'a plus lieu d'être,
   * même si `ecran` la désigne encore — c'est le montage du combat qui le
   * fera changer, et il attend les capacités.
   *
   * Sans ce relais, un joueur qui validait son équipe sans que les capacités
   * puissent arriver — hors ligne, dex non téléchargé — restait devant sa
   * grille avec un bouton « Équipe prête » qui ne produisait rien de
   * visible. L'erreur existait déjà ; elle n'avait simplement nulle part où
   * s'afficher.
   */
  const enPreparation = ecran.kind === 'equipe' && equipes !== null

  return {
    /* Données */
    pokemon,
    chart,
    formesParEspece,
    noms,
    chargement: isPending || movesPending,
    erreur: isError || movesError ? (error instanceof Error ? error.message : null) : null,
    recharger: refetch,
    capacitesEnErreur: movesetsError,
    rechargerCapacites,

    /* Partie */
    mode,
    /** Le camp que tient l'appareil, ou `null` quand il les tient tous les deux. */
    moi: mode === 'duo' ? null : (0 as Side),
    ecran,
    passage,
    enPreparation,
    etat,
    affiche,
    evenements,
    curseur,
    message,
    impact,

    /* Actions */
    choisirEquipe,
    choisirAction,
    choisirRemplacant,
    rejouer,
    avancerRecit,
    franchirPassage,
  }
}

export type Combat = ReturnType<typeof useCombat>

/** Réexporté pour la page, qui n'a pas d'autre raison de connaître le moteur. */
export { actif }
