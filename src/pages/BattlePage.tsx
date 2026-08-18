import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Link } from 'react-router'
import { ActionPanel, ListeRemplacants } from '@/components/battle/ActionPanel'
import { DUREE_EFFET } from '@/components/battle/AttackEffect'
import type { Effet } from '@/components/battle/AttackEffect'
import { BattleArena } from '@/components/battle/BattleArena'
import { DUREE_JAUGE } from '@/components/battle/HealthBar'
import { PassScreen } from '@/components/battle/PassScreen'
import { TeamPicker } from '@/components/battle/TeamPicker'
import { ErrorScreen, LoadingScreen } from '@/components/ui/StateScreens'
import { ArrowLeftIcon, PokeballIcon } from '@/components/ui/icons'
import { useBattleForms } from '@/hooks/use-forms'
import { useMoves, useMovesets } from '@/hooks/use-moves'
import { useNomsJoueurs } from '@/hooks/use-noms-joueurs'
import { usePokedex } from '@/hooks/use-pokedex'
import { useTapLock } from '@/hooks/use-tap-lock'
import {
  actif,
  creerBattler,
  creerCombat,
  prochainEcran,
  remplacer,
  remplacantsDisponibles,
  resoudreTour,
} from '@/lib/battle/engine'
import { estMuet, texteEvenement } from '@/lib/battle/log'
import { ecrire, effacer, lire, reprendre } from '@/lib/battle/save'
import type { Noms } from '@/lib/battle/noms'
import { graineAleatoire } from '@/lib/battle/rng'
import type {
  Action,
  BattleEvent,
  BattleState,
  Choix,
  Ecran,
  Passage,
  Side,
  Team,
} from '@/lib/battle/types'
import type { TypeChart } from '@/lib/type-chart'

/* ------------------------------------------------------------------ *
 * Écrans
 * ------------------------------------------------------------------ */

/** Le temps de laisser l'œil se poser sur la valeur d'arrivée de la jauge. */
const MARGE_JAUGE = 150

/**
 * Plancher pour `prefers-reduced-motion`, où la jauge saute à sa valeur
 * finale en zéro seconde. Sans lui l'étape muette passerait inaperçue, et
 * les PV changeraient sans qu'on ait rien vu descendre.
 */
const PLANCHER_MUET = 250

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

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */

export function BattlePage() {
  const { pokemon, byId, chart, isPending, isError, error, refetch } = usePokedex()
  const { noms } = useNomsJoueurs()
  const { byId: movesById, isPending: movesPending, isError: movesError } = useMoves()
  /*
   * Les formes ne bloquent pas le combat : sans la table, la sélection ne
   * propose que les espèces par défaut et tout le reste fonctionne. Les
   * attendre ferait dépendre un mode entier d'une requête accessoire.
   */
  const { parEspece: formesParEspece } = useBattleForms(byId)

  /*
   * La partie sauvegardée, lue une seule fois au montage.
   *
   * `localStorage` est synchrone, et c'est précisément ce qu'on veut ici :
   * l'état est là dès le premier rendu. Avec IndexedDB — le stockage retenu
   * pour le dex, parce que les fiches n'y tenaient pas — il faudrait un
   * écran d'attente, et le sélecteur d'équipe apparaîtrait une fraction de
   * seconde avant que le combat ne revienne. Onze kilo-octets sur cinq
   * mégas : la contrainte qui avait fait fuir localStorage ne s'applique pas.
   */
  const [reprise] = useState(() => {
    const sauve = lire()
    return sauve ? { sauve, ...reprendre(sauve) } : null
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
   * Le récit du tour, et l'étape à l'écran. Le rejeu n'avance plus au
   * chronomètre mais à la tape : le joueur 2 vient de choisir son attaque
   * et ne s'attendait pas à la réponse, il lui faut le temps de la lire.
   *
   * Une étape par événement. On tape pour ce qu'on lit ; ce qu'on regarde
   * s'enchaîne seul — la jauge qui se vide est déclenchée par la tape
   * donnée sur l'annonce de l'attaque, et n'a rien de nouveau à faire lire
   * une fois arrivée.
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
   *
   * Le coût est nul : la requête prend déjà une liste, et douze
   * identifiants tiennent dans le même aller-retour que six.
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
    setPassage({ vers: 1, ecran: { kind: 'choix', side: 0 }, detail: 'Le combat commence !' })
  }, [etat, equipes, movesets, movesById, byId, formesParEspece])

  /* --- Sauvegarde de la partie -------------------------------------- */
  useEffect(() => {
    // Avant l'équipe du joueur 1, il n'y a rien à retenir.
    if (!equipe1) return
    ecrire({ equipe1, equipe2, etat, ecran, passage })
  }, [equipe1, equipe2, etat, ecran, passage])

  /* --- Enchaînement après un tour ou un remplacement ---------------- */
  const enchainer = useCallback((courant: BattleState) => {
    const suite = prochainEcran(courant)
    /*
     * Avec un passage, l'écran courant reste dessous jusqu'à la tape : c'est
     * lui qui révélera `suite.ecran`. Sans passage — la fin du combat — il
     * n'y a rien à cacher, on y va directement.
     */
    if (suite.passage) setPassage(suite.passage)
    else setEcran(suite.ecran)
  }, [])

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

  /* --- Enchaînement des étapes muettes ------------------------------ */
  const reduit = useReducedMotion()
  const etapeCourante = ecran.kind === 'replay' ? evenements[curseur] : undefined
  const etapeMuette = etapeCourante !== undefined && estMuet(etapeCourante)

  /*
   * Le geste se joue sur l'étape qui **suit** l'annonce de l'attaque : la
   * tape donnée sur « Mewtwo utilise Dévorêve ! » déclenche le coup, et
   * cette étape-là en est le paiement — les dégâts le plus souvent, mais
   * aussi l'esquive et l'immunité, où le coup part sans rien toucher.
   */
  const precedente = curseur > 0 ? evenements[curseur - 1] : undefined
  const annonce = ecran.kind === 'replay' && precedente?.kind === 'move' ? precedente : undefined
  const porte = etapeCourante?.kind === 'damage'
  const manque = etapeCourante?.kind === 'miss' || etapeCourante?.kind === 'immune'

  const effet: (Omit<Effet, 'depuis'> & { side: Side }) | null =
    annonce && (porte || manque)
      ? {
          cle: curseur,
          archetype: annonce.archetype,
          type: annonce.type,
          side: annonce.side,
          rate: !porte,
        }
      : null

  const avecGeste = effet !== null

  useEffect(() => {
    if (!etapeMuette) return

    /*
     * Le minuteur **accélère**, il n'autorise pas : la surface de
     * progression reste active pendant l'étape, donc un onglet en veille —
     * où les minuteurs sont plafonnés — retarde l'enchaînement sans jamais
     * bloquer le combat. C'est la différence avec un rejeu suspendu à la fin
     * d'une animation, qui n'a lui aucune porte de sortie.
     */
    const trajet = avecGeste ? DUREE_EFFET * 1000 : 0
    const delai = reduit ? PLANCHER_MUET : trajet + DUREE_JAUGE * 1000 + MARGE_JAUGE
    const minuteur = window.setTimeout(avancerRecit, delai)
    return () => window.clearTimeout(minuteur)
  }, [etapeMuette, curseur, reduit, avecGeste, avancerRecit])

  /* --- Actions ------------------------------------------------------- */
  const choisirEquipe = (choisis: Choix[]) => {
    if (ecran.kind !== 'equipe') return

    if (ecran.joueur === 1) {
      setEquipe1(choisis)
      setPassage({ vers: 2, ecran: { kind: 'equipe', joueur: 2 }, detail: 'Compose ton équipe' })
    } else {
      // Les capacités des six Pokémon partent alors en une seule requête,
      // et l'effet de construction enchaîne sur l'écran de passage.
      setEquipe2(choisis)
    }
  }

  const choisirAction = (action: Action) => {
    if (ecran.kind !== 'choix' || !etat || !chart) return

    if (ecran.side === 0) {
      setEnAttente(action)
      setPassage({ vers: 2, ecran: { kind: 'choix', side: 1 } })
      return
    }

    const actions: [Action, Action] = [enAttente ?? { kind: 'move', slot: 0 }, action]
    const resultat = resoudreTour(etat, actions, chart)

    setAffiche(etat)
    setEtat(resultat.etat)
    setEvenements(resultat.events)
    setCurseur(0)
    setEnAttente(null)
    setEcran({ kind: 'replay' })
  }

  const choisirRemplacant = (index: number) => {
    if (ecran.kind !== 'remplacement' || !etat) return

    const resultat = remplacer(etat, ecran.side, index)
    const premier = resultat.events[0]

    setEtat(resultat.etat)
    setAffiche(resultat.etat)
    if (premier) setMessage(texteEvenement(premier, noms))
    enchainer(resultat.etat)
  }

  const rejouer = (memesEquipes: boolean) => {
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
      // construction, qui remonte les équipes et repose l'écran de passage.
      setEcran({ kind: 'choix', side: 0 })
    } else {
      setEquipe1(null)
      setEquipe2(null)
      setEcran({ kind: 'equipe', joueur: 1 })
    }
  }

  /* --- Rendu --------------------------------------------------------- */
  if (isPending || movesPending) {
    return (
      <Cadre>
        <LoadingScreen label="Préparation du combat…" />
      </Cadre>
    )
  }

  if (isError || movesError) {
    return (
      <Cadre>
        <ErrorScreen
          message={error instanceof Error ? error.message : 'Chargement impossible'}
          onRetry={() => void refetch()}
        />
      </Cadre>
    )
  }

  if (!pokemon) return null

  const enPassage = passage !== null

  /*
   * Les deux équipes sont composées : la sélection n'a plus lieu d'être,
   * même si `ecran` la désigne encore — c'est le montage du combat qui le
   * fera changer, et il attend les capacités.
   *
   * Sans ce relais, un joueur 2 qui validait son équipe sans que les
   * capacités puissent arriver — hors ligne, dex non téléchargé — restait
   * devant sa grille avec un bouton « Équipe prête » qui ne produisait rien
   * de visible. L'erreur existait déjà ; elle n'avait simplement nulle part
   * où s'afficher.
   */
  const enPreparation = ecran.kind === 'equipe' && equipes !== null

  return (
    <div className="min-h-dvh">
      {enPassage && (
        <PassScreen
          player={passage.vers}
          nom={noms[passage.vers - 1]}
          detail={passage.detail}
          onReady={() => {
            setEcran(passage.ecran)
            setPassage(null)
          }}
        />
      )}

      {/* L'écran de passage est monté par-dessus, mais le contenu reste
          rendu dessous : le masquer ici ferait clignoter l'arène au tap. */}
      <div aria-hidden={enPassage}>
        {ecran.kind === 'equipe' && !enPreparation && (
          <TeamPicker
            key={ecran.joueur}
            pokemon={pokemon}
            player={ecran.joueur}
            formes={formesParEspece}
            onDone={choisirEquipe}
          />
        )}

        {/*
          La condition porte sur ce qu'on a, pas sur ce qu'on attend. Une
          requête désactivée — le cas d'une partie reprise, qui n'a plus
          rien à demander — se déclare `pending` sans fin : s'y fier
          masquerait un combat parfaitement jouable derrière un écran de
          chargement définitif.
        */}
        {(ecran.kind !== 'equipe' || enPreparation) &&
          (!affiche || !etat ? (
            <Cadre>
              {movesetsError ? (
                <ErrorScreen
                  message={
                    navigator.onLine
                      ? 'Impossible de charger les attaques des Pokémon choisis.'
                      : "Hors ligne, et les attaques de ces Pokémon ne sont pas dans ce qui a été téléchargé. Télécharge le dex depuis l'accueil, ou reconnecte-toi."
                  }
                  onRetry={() => void rechargerCapacites()}
                />
              ) : (
                <LoadingScreen label="Préparation du combat…" />
              )}
            </Cadre>
          ) : (
            <Combat
              ecran={ecran}
              affiche={affiche}
              etat={etat}
              chart={chart}
              message={message}
              noms={noms}
              impact={impact}
              effet={effet}
              curseur={curseur}
              attendTape={ecran.kind === 'replay' && !etapeMuette}
              onAvancer={avancerRecit}
              onAction={choisirAction}
              onRemplacer={choisirRemplacant}
              onRejouer={rejouer}
            />
          ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Sous-vues
 * ------------------------------------------------------------------ */

function Cadre({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <EnTete />
      {children}
    </div>
  )
}

/**
 * Deux sorties, et elles ne font pas la même chose.
 *
 * Le lien « Pokédex » quitte l'écran sans toucher à la partie : depuis
 * qu'elle est sauvegardée, on la retrouve intacte en revenant. « Quitter »
 * l'abandonne pour de bon. Sans cette seconde sortie, une partie qui ne
 * périme jamais interdirait d'en commencer une neuve avant d'avoir fini la
 * précédente.
 */
function EnTete({ tour, onQuitter }: { tour?: number; onQuitter?: () => void }) {
  const [confirme, setConfirme] = useState(false)

  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <Link
        to="/"
        className="flex items-center gap-1.5 font-semibold text-ink-soft text-sm transition hover:text-ink"
      >
        <ArrowLeftIcon className="size-4" />
        Pokédex
      </Link>

      <div className="flex items-center gap-2">
        {tour !== undefined && (
          <span className="rounded-full border border-line bg-panel-soft px-3 py-1 font-semibold text-ink-soft text-xs">
            Tour {tour}
          </span>
        )}

        {/* Confirmation sur place plutôt qu'en surcouche : le geste est
            destructeur, mais il ne mérite pas de couvrir le combat. */}
        {onQuitter &&
          (confirme ? (
            <span className="flex items-center gap-1.5">
              <span className="font-semibold text-ink-soft text-xs">Abandonner ?</span>
              <button
                type="button"
                onClick={onQuitter}
                className="rounded-full bg-rose-500 px-3 py-1 font-bold text-white text-xs"
              >
                Oui
              </button>
              <button
                type="button"
                onClick={() => setConfirme(false)}
                className="rounded-full border border-line px-3 py-1 font-semibold text-ink-soft text-xs"
              >
                Non
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirme(true)}
              className="rounded-full border border-line px-3 py-1 font-semibold text-ink-soft text-xs transition hover:text-ink"
            >
              Quitter
            </button>
          ))}
      </div>
    </div>
  )
}

type CombatProps = {
  ecran: Ecran
  affiche: BattleState
  etat: BattleState
  chart: TypeChart | undefined
  message: string | null
  noms: Noms
  impact: Side | null
  /** Le geste d'attaque à jouer, `null` hors du moment de la frappe. */
  effet: (Omit<Effet, 'depuis'> & { side: Side }) | null
  /** Étape à l'écran : réarme le verrou à chaque avancée. */
  curseur: number
  /**
   * Faux pendant une étape muette, qui s'enchaîne d'elle-même : annoncer
   * une attente qui n'existe pas mentirait sur l'état de l'écran.
   */
  attendTape: boolean
  onAvancer: () => void
  onAction: (action: Action) => void
  onRemplacer: (index: number) => void
  onRejouer: (memesEquipes: boolean) => void
}

function Combat({
  ecran,
  affiche,
  etat,
  chart,
  message,
  noms,
  impact,
  effet,
  curseur,
  attendTape,
  onAvancer,
  onAction,
  onRemplacer,
  onRejouer,
}: CombatProps) {
  const reduit = useReducedMotion()
  const enRejeu = ecran.kind === 'replay'

  /*
   * Un seul verrou pour les deux cibles que la tape précédente peut
   * atteindre : la surface de progression, réarmée à chaque réplique, et
   * les boutons de fin de combat, qui apparaissent exactement sous le doigt
   * du joueur qui vient de dérouler la dernière ligne.
   */
  const arme = useTapLock(`${ecran.kind}-${curseur}`)
  /*
   * Chaque joueur voit son propre Pokémon de dos, en bas. Pendant le rejeu
   * et à la fin, on garde la vue du joueur 1 : les deux regardent l'écran
   * ensemble, et faire pivoter la scène serait désorientant.
   */
  const perspective: Side =
    ecran.kind === 'choix' || ecran.kind === 'remplacement' ? ecran.side : 0
  const adverse = (1 - perspective) as Side

  const vue = (side: Side) => ({
    battler: actif(affiche, side),
    equipe: affiche.teams[side],
  })

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <EnTete tour={affiche.turn} onQuitter={() => onRejouer(false)} />

      <BattleArena
        joueur={vue(perspective)}
        adversaire={vue(adverse)}
        perspective={perspective}
        impact={impact}
        effet={effet}
      />

      {/*
        Pas d'`AnimatePresence mode="wait"` ici : il ne monte la nouvelle
        phrase qu'une fois l'ancienne sortie, ce qui suspend le journal à
        l'achèvement d'une animation. Si les images se raréfient — onglet en
        arrière-plan, animations réduites — le texte se fige sur le message
        précédent alors que le combat, lui, avance. Le remplacement est donc
        immédiat, et seule l'apparition est animée.
      */}
      <div className="mt-4 flex min-h-[3.25rem] items-center gap-3 rounded-2xl border border-line bg-panel-soft px-4 py-3">
        <motion.p
          key={message ?? 'vide'}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16 }}
          className="flex-1 font-semibold text-ink"
        >
          {message ?? 'Le combat commence !'}
        </motion.p>

        {/* Le chevron des jeux : sans repère visible, on ne sait pas si
            l'écran attend une tape ou s'il s'est figé. Il disparaît pendant
            la descente de la jauge, qui n'attend rien de personne. */}
        {attendTape && (
          <motion.span
            aria-hidden="true"
            animate={reduit ? undefined : { opacity: [1, 0.25, 1], y: [0, 3, 0] }}
            transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
            className="shrink-0 text-accent text-sm"
          >
            ▼
          </motion.span>
        )}
      </div>

      <div className="mt-4">
        {ecran.kind === 'choix' && (
          /*
           * La clé force le remontage à chaque changement de joueur ou de
           * Pokémon. Sans elle le panneau garde son état interne : un joueur
           * qui a ouvert « Changer de Pokémon » passe la main, et le suivant
           * ouvre son tour sur la liste de changement au lieu de ses
           * attaques. Entre les deux choix d'un même tour, l'écran reste sur
           * `choix` et rien ne provoque le démontage.
           */
          <ActionPanel
            key={`${ecran.side}-${actif(etat, ecran.side).spriteId}`}
            battler={actif(etat, ecran.side)}
            adversaire={actif(etat, (1 - ecran.side) as Side)}
            chart={chart}
            remplacants={remplacantsDisponibles(etat, ecran.side)}
            onAction={onAction}
          />
        )}

        {ecran.kind === 'remplacement' && (
          <div className="space-y-2">
            <p className="font-semibold text-ink-soft text-sm">Envoie ton prochain Pokémon.</p>
            <ListeRemplacants
              remplacants={remplacantsDisponibles(etat, ecran.side)}
              onChoisir={onRemplacer}
            />
          </div>
        )}

        {ecran.kind === 'fin' && etat.winner !== null && (
          <div className="space-y-3 text-center">
            <PokeballIcon className="mx-auto size-12 text-accent" />
            <p className="font-black text-2xl text-ink">
              {noms[etat.winner]} remporte le combat !
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => arme && onRejouer(true)}
                className="rounded-full bg-accent px-5 py-2.5 font-bold text-white"
              >
                Revanche
              </button>
              <button
                type="button"
                onClick={() => arme && onRejouer(false)}
                className="rounded-full border border-line bg-panel-soft px-5 py-2.5 font-bold text-ink-soft transition hover:text-ink"
              >
                Nouvelles équipes
              </button>
            </div>
          </div>
        )}

        {attendTape && (
          <p className="text-center text-ink-faint text-sm">
            Touche l’écran pour continuer
          </p>
        )}
      </div>

      {/*
        Surface de progression, par-dessus toute la scène : sur un téléphone
        que deux joueurs se passent, taper n'importe où vaut mieux que viser
        une cible. Elle est sous l'écran de passage (`z-50`), qui doit
        continuer de tout masquer.

        Elle reste montée pendant son verrou plutôt que d'être retirée : la
        démonter rendrait les tapes au contenu qu'elle protège, ce qui est
        exactement ce qu'on veut empêcher.
      */}
      {enRejeu && (
        <button
          type="button"
          autoFocus
          onClick={() => arme && onAvancer()}
          aria-label="Continuer le tour"
          className="fixed inset-0 z-30 cursor-default"
        />
      )}
    </div>
  )
}
