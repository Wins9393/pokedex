import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { Link } from 'react-router'
import { ActionPanel, ListeRemplacants } from '@/components/battle/ActionPanel'
import { BattleArena } from '@/components/battle/BattleArena'
import { PassScreen } from '@/components/battle/PassScreen'
import { TeamPicker } from '@/components/battle/TeamPicker'
import { ErrorScreen, LoadingScreen } from '@/components/ui/StateScreens'
import { ArrowLeftIcon, PokeballIcon } from '@/components/ui/icons'
import { useMoves, useMovesets } from '@/hooks/use-moves'
import { usePokedex } from '@/hooks/use-pokedex'
import {
  actif,
  creerBattler,
  creerCombat,
  doitRemplacer,
  remplacer,
  remplacantsDisponibles,
  resoudreTour,
} from '@/lib/battle/engine'
import { dureeEvenement, texteEvenement } from '@/lib/battle/log'
import { graineAleatoire } from '@/lib/battle/rng'
import type { Action, BattleEvent, BattleState, Side, Team } from '@/lib/battle/types'
import type { TypeChart } from '@/lib/type-chart'

/* ------------------------------------------------------------------ *
 * Écrans
 * ------------------------------------------------------------------ */

type Ecran =
  | { kind: 'equipe'; joueur: 1 | 2 }
  | { kind: 'choix'; side: Side }
  | { kind: 'replay' }
  | { kind: 'remplacement'; side: Side }
  | { kind: 'fin' }

/** Écran de passage en attente : il masque l'écran suivant jusqu'au tap. */
type Passage = { vers: 1 | 2; ecran: Ecran; detail?: string }

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
  const { byId: movesById, isPending: movesPending, isError: movesError } = useMoves()

  /*
   * Les deux équipes sont stockées séparément, et `equipes` n'existe que
   * lorsque les deux sont complètes. Conserver un couple à moitié rempli
   * ferait démarrer la construction du combat dès le premier joueur, avec
   * une équipe adverse vide.
   */
  const [equipe1, setEquipe1] = useState<number[] | null>(null)
  const [equipe2, setEquipe2] = useState<number[] | null>(null)
  const equipes = useMemo(
    () => (equipe1 && equipe2 ? ([equipe1, equipe2] as [number[], number[]]) : null),
    [equipe1, equipe2],
  )

  const [etat, setEtat] = useState<BattleState | null>(null)
  const [affiche, setAffiche] = useState<BattleState | null>(null)

  const [ecran, setEcran] = useState<Ecran>({ kind: 'equipe', joueur: 1 })
  const [passage, setPassage] = useState<Passage | null>(null)

  const [enAttente, setEnAttente] = useState<Action | null>(null)
  const [evenements, setEvenements] = useState<BattleEvent[]>([])
  const [curseur, setCurseur] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const [impact, setImpact] = useState<Side | null>(null)

  const idsEquipes = useMemo(
    () => (equipes ? [...new Set([...equipes[0], ...equipes[1]])] : []),
    [equipes],
  )
  const { movesets, isPending: movesetsPending, isError: movesetsError } = useMovesets(idsEquipes)

  /* --- Construction du combat une fois les capacités reçues --------- */
  useEffect(() => {
    if (etat || !equipes || !movesets || !movesById || !byId) return

    const monter = (ids: number[]) =>
      ids
        .map((id) => byId.get(id))
        .filter((summary) => summary !== undefined)
        .map((summary) => creerBattler(summary, movesets[summary.id] ?? [], movesById))

    const combat = creerCombat([monter(equipes[0]), monter(equipes[1])], graineAleatoire())
    setEtat(combat)
    setAffiche(combat)
    setPassage({ vers: 1, ecran: { kind: 'choix', side: 0 }, detail: 'Le combat commence !' })
  }, [etat, equipes, movesets, movesById, byId])

  /* --- Enchaînement après un tour ou un remplacement ---------------- */
  const enchainer = useCallback((courant: BattleState) => {
    if (courant.winner !== null) {
      setEcran({ kind: 'fin' })
      return
    }

    for (const side of [0, 1] as Side[]) {
      if (doitRemplacer(courant, side)) {
        setPassage({
          vers: (side + 1) as 1 | 2,
          ecran: { kind: 'remplacement', side },
          detail: 'Choisis ton prochain Pokémon',
        })
        return
      }
    }

    setPassage({ vers: 1, ecran: { kind: 'choix', side: 0 } })
  }, [])

  /* --- Rejeu des événements ----------------------------------------- */
  useEffect(() => {
    if (ecran.kind !== 'replay' || !etat) return

    if (curseur >= evenements.length) {
      // Resynchronisation complète : le rejeu ne reconstitue que les PV et
      // les changements, pas les PP consommés.
      setAffiche(etat)
      setImpact(null)
      enchainer(etat)
      return
    }

    const event = evenements[curseur]
    const texte = texteEvenement(event)
    if (texte) setMessage(texte)
    setAffiche((precedent) => (precedent ? appliquer(precedent, event) : precedent))
    setImpact(event.kind === 'damage' ? ((1 - event.side) as Side) : null)

    const minuteur = window.setTimeout(
      () => setCurseur((valeur) => valeur + 1),
      dureeEvenement(event),
    )
    return () => window.clearTimeout(minuteur)
  }, [ecran, curseur, evenements, etat, enchainer])

  /* --- Actions ------------------------------------------------------- */
  const choisirEquipe = (ids: number[]) => {
    if (ecran.kind !== 'equipe') return

    if (ecran.joueur === 1) {
      setEquipe1(ids)
      setPassage({ vers: 2, ecran: { kind: 'equipe', joueur: 2 }, detail: 'Compose ton équipe' })
    } else {
      // Les capacités des six Pokémon partent alors en une seule requête,
      // et l'effet de construction enchaîne sur l'écran de passage.
      setEquipe2(ids)
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
    if (premier) setMessage(texteEvenement(premier))
    enchainer(resultat.etat)
  }

  const rejouer = (memesEquipes: boolean) => {
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

  return (
    <div className="min-h-dvh">
      {enPassage && (
        <PassScreen
          player={passage.vers}
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
        {ecran.kind === 'equipe' && (
          <TeamPicker
            key={ecran.joueur}
            pokemon={pokemon}
            player={ecran.joueur}
            onDone={choisirEquipe}
          />
        )}

        {ecran.kind !== 'equipe' &&
          (movesetsPending || !affiche || !etat ? (
            <Cadre>
              {movesetsError ? (
                <ErrorScreen
                  message="Impossible de charger les attaques des Pokémon choisis."
                  onRetry={() => window.location.reload()}
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
              impact={impact}
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

function EnTete({ tour }: { tour?: number }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <Link
        to="/"
        className="flex items-center gap-1.5 font-semibold text-ink-soft text-sm transition hover:text-ink"
      >
        <ArrowLeftIcon className="size-4" />
        Pokédex
      </Link>
      {tour !== undefined && (
        <span className="rounded-full border border-line bg-panel-soft px-3 py-1 font-semibold text-ink-soft text-xs">
          Tour {tour}
        </span>
      )}
    </div>
  )
}

type CombatProps = {
  ecran: Ecran
  affiche: BattleState
  etat: BattleState
  chart: TypeChart | undefined
  message: string | null
  impact: Side | null
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
  impact,
  onAction,
  onRemplacer,
  onRejouer,
}: CombatProps) {
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
      <EnTete tour={affiche.turn} />

      <BattleArena joueur={vue(perspective)} adversaire={vue(adverse)} impact={impact} />

      {/*
        Pas d'`AnimatePresence mode="wait"` ici : il ne monte la nouvelle
        phrase qu'une fois l'ancienne sortie, ce qui suspend le journal à
        l'achèvement d'une animation. Si les images se raréfient — onglet en
        arrière-plan, animations réduites — le texte se fige sur le message
        précédent alors que le combat, lui, avance. Le remplacement est donc
        immédiat, et seule l'apparition est animée.
      */}
      <div className="mt-4 min-h-[3.25rem] rounded-2xl border border-line bg-panel-soft px-4 py-3">
        <motion.p
          key={message ?? 'vide'}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16 }}
          className="font-semibold text-ink"
        >
          {message ?? 'Le combat commence !'}
        </motion.p>
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
            key={`${ecran.side}-${actif(etat, ecran.side).id}`}
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
              Joueur {etat.winner + 1} remporte le combat !
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => onRejouer(true)}
                className="rounded-full bg-accent px-5 py-2.5 font-bold text-white"
              >
                Revanche
              </button>
              <button
                type="button"
                onClick={() => onRejouer(false)}
                className="rounded-full border border-line bg-panel-soft px-5 py-2.5 font-bold text-ink-soft transition hover:text-ink"
              >
                Nouvelles équipes
              </button>
            </div>
          </div>
        )}

        {ecran.kind === 'replay' && (
          <p className="text-center text-ink-faint text-sm">Résolution du tour…</p>
        )}
      </div>
    </div>
  )
}
