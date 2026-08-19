import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Link, useNavigate, useParams } from 'react-router'
import { ActionPanel, ListeRemplacants } from '@/components/battle/ActionPanel'
import { DUREE_EFFET } from '@/components/battle/AttackEffect'
import type { Effet } from '@/components/battle/AttackEffect'
import { BattleArena } from '@/components/battle/BattleArena'
import { DUREE_JAUGE } from '@/components/battle/HealthBar'
import { PassScreen } from '@/components/battle/PassScreen'
import { TeamPicker } from '@/components/battle/TeamPicker'
import { ErrorScreen, LoadingScreen } from '@/components/ui/StateScreens'
import {
  ArrowLeftIcon,
  ChipIcon,
  LinkIcon,
  PokeballIcon,
  UsersIcon,
} from '@/components/ui/icons'
import { useCombat } from '@/hooks/use-combat'
import { useTapLock } from '@/hooks/use-tap-lock'
import { actif, remplacantsDisponibles } from '@/lib/battle/engine'
import { estMuet } from '@/lib/battle/log'
import { CHEMIN, LIBELLE, modeDepuisSegment } from '@/lib/battle/modes'
import {
  LONGUEUR_CODE,
  TEXTE_ERREUR,
  codeAleatoire,
  codeValide,
  normaliserCode,
} from '@/lib/battle/protocole'
import type { Noms } from '@/lib/battle/noms'
import { lire } from '@/lib/battle/save'
import type { Action, BattleState, Ecran, Mode, Side } from '@/lib/battle/types'
import type { TypeChart } from '@/lib/type-chart'

/* ------------------------------------------------------------------ *
 * Rythme du récit
 * ------------------------------------------------------------------ */

/** Le temps de laisser l'œil se poser sur la valeur d'arrivée de la jauge. */
const MARGE_JAUGE = 150

/**
 * Plancher pour `prefers-reduced-motion`, où la jauge saute à sa valeur
 * finale en zéro seconde. Sans lui l'étape muette passerait inaperçue, et
 * les PV changeraient sans qu'on ait rien vu descendre.
 */
const PLANCHER_MUET = 250

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */

/**
 * L'entrée du mode combat : la sélection du mode, ou la partie elle-même.
 *
 * Le mode est un segment d'URL et non un état interne — c'est ce qui rend
 * une partie partageable par lien, et le retour arrière du navigateur
 * cohérent avec ce qu'on voit.
 */
export function BattlePage() {
  const { mode: segment, code } = useParams()
  const mode = modeDepuisSegment(segment)
  const salle = code ? normaliserCode(code) : null

  if (!mode) return <ChoixMode />
  // Sans salle, le mode en ligne commence par en choisir une.
  if (mode === 'ligne' && !salle) return <ChoixSalle />

  return <Partie key={`${mode}-${salle ?? ''}`} mode={mode} code={salle} />
}

/* ------------------------------------------------------------------ *
 * Choix du mode
 * ------------------------------------------------------------------ */

const ICONE: Record<Mode, (props: { className?: string }) => ReactNode> = {
  ligne: LinkIcon,
  duo: UsersIcon,
  ia: ChipIcon,
}

function CarteMode({ mode, bientot = false }: { mode: Mode; bientot?: boolean }) {
  const Icone = ICONE[mode]
  const { titre, detail } = LIBELLE[mode]

  const contenu = (
    <>
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent/12 text-accent">
        <Icone className="size-5.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-ink">{titre}</span>
        <span className="block text-ink-faint text-sm">{detail}</span>
      </span>
      {bientot && (
        <span className="shrink-0 rounded-full border border-line px-2 py-0.5 font-semibold text-ink-faint text-xs">
          Bientôt
        </span>
      )}
    </>
  )

  const habillage =
    'flex w-full items-center gap-3 rounded-2xl border border-line bg-panel-soft p-4 text-left transition'

  if (bientot) {
    return (
      <div aria-disabled="true" className={`${habillage} opacity-50`}>
        {contenu}
      </div>
    )
  }

  return (
    <Link to={CHEMIN(mode)} className={`${habillage} hover:border-ink-faint hover:bg-panel`}>
      {contenu}
    </Link>
  )
}

function ChoixMode() {
  /*
   * Une seule partie est gardée à la fois, et elle appartient à son mode.
   * La proposer ici plutôt que dans la partie elle-même évite le piège de
   * l'ouverture : entrer dans un mode ne doit pas reprendre d'autorité une
   * partie qu'on avait peut-être abandonnée.
   */
  const [sauvegarde] = useState(() => lire())

  return (
    <Cadre>
      <h1 className="mb-1 font-black text-2xl text-ink">Combat</h1>
      <p className="mb-5 text-ink-faint text-sm">
        Trois Pokémon chacun, au niveau 50. Choisis ton adversaire.
      </p>

      <div className="space-y-2.5">
        <CarteMode mode="ligne" />
        <CarteMode mode="duo" />
        <CarteMode mode="ia" />
      </div>

      {sauvegarde && (
        <div className="mt-6 rounded-2xl border border-accent/30 bg-accent/8 p-4">
          <p className="font-bold text-ink">Une partie est en cours</p>
          <p className="mb-3 text-ink-faint text-sm">
            {LIBELLE[sauvegarde.mode].titre}
            {sauvegarde.etat ? ` — tour ${sauvegarde.etat.turn}` : ' — équipes en préparation'}
          </p>
          <Link
            to={CHEMIN(sauvegarde.mode)}
            className="inline-flex rounded-full bg-accent px-4 py-2 font-bold text-sm text-white"
          >
            Reprendre
          </Link>
        </div>
      )}
    </Cadre>
  )
}

/* ------------------------------------------------------------------ *
 * Le jeu en ligne : entrer dans une salle
 * ------------------------------------------------------------------ */

/**
 * Créer une salle ou en rejoindre une.
 *
 * Le code à quatre lettres **est** l'identifiant de l'objet qui arbitre la
 * partie : il n'y a pas de registre de salles, pas de compte, pas d'attente
 * d'appariement. On le crée en le tirant au sort, l'autre le tape ou suit
 * le lien, et la salle existe parce qu'on l'a nommée.
 */
function ChoixSalle() {
  const naviguer = useNavigate()
  const [saisi, setSaisi] = useState('')
  const code = normaliserCode(saisi)

  return (
    <Cadre>
      <h1 className="mb-1 font-black text-2xl text-ink">Combat en ligne</h1>
      <p className="mb-6 text-ink-faint text-sm">
        Deux téléphones, chacun sa liste d'attaques. Les deux joueurs choisissent en même temps.
      </p>

      <button
        type="button"
        onClick={() => naviguer(`${CHEMIN('ligne')}/${codeAleatoire()}`)}
        className="w-full rounded-2xl bg-accent px-5 py-3.5 font-bold text-white shadow-[var(--card-glow)] transition hover:brightness-110"
      >
        Créer une salle
      </button>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="font-semibold text-ink-faint text-xs">ou</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (codeValide(code)) naviguer(`${CHEMIN('ligne')}/${code}`)
        }}
        className="space-y-3"
      >
        <label htmlFor="code-salle" className="block font-semibold text-ink-soft text-sm">
          Rejoindre avec un code
        </label>
        <input
          id="code-salle"
          value={saisi}
          onChange={(event) => setSaisi(normaliserCode(event.target.value))}
          placeholder="ABCD"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={LONGUEUR_CODE}
          className="w-full rounded-2xl border border-line bg-panel-soft px-4 py-3 text-center font-black text-2xl text-ink tracking-[0.3em] uppercase placeholder:text-ink-faint/40"
        />
        <button
          type="submit"
          disabled={!codeValide(code)}
          className="w-full rounded-2xl border border-line bg-panel-soft px-5 py-3 font-bold text-ink-soft transition enabled:hover:text-ink disabled:opacity-40"
        >
          Rejoindre
        </button>
      </form>
    </Cadre>
  )
}

/**
 * Le salon : on est dans la salle, on attend l'autre, on compose.
 *
 * Le code reste affiché en grand tant que la partie n'a pas commencé —
 * c'est la seule chose à transmettre, et la chercher dans la barre
 * d'adresse d'un téléphone est une épreuve.
 */
function Salon({
  code,
  nomAdverse,
  adversaireConnecte,
  connecte,
  onComposer,
}: {
  code: string
  nomAdverse: string | null
  adversaireConnecte: boolean
  connecte: boolean
  onComposer: () => void
}) {
  const [copie, setCopie] = useState(false)
  const lien = `${window.location.origin}${CHEMIN('ligne')}/${code}`

  return (
    <Cadre>
      <div className="rounded-2xl border border-line bg-panel-soft p-5 text-center">
        <p className="font-semibold text-ink-faint text-sm">Code de la salle</p>
        <p className="my-2 font-black text-4xl text-ink tracking-[0.35em]">{code}</p>

        <button
          type="button"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(lien)
              .then(() => setCopie(true))
              .catch(() => setCopie(false))
          }}
          className="rounded-full border border-line px-4 py-1.5 font-semibold text-ink-soft text-sm transition hover:text-ink"
        >
          {copie ? 'Lien copié' : 'Copier le lien'}
        </button>
      </div>

      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-line bg-panel-soft px-4 py-3">
        <span
          aria-hidden="true"
          className={`size-2.5 shrink-0 rounded-full ${
            adversaireConnecte ? 'bg-emerald-500' : 'animate-pulse bg-amber-500'
          }`}
        />
        <p className="flex-1 font-semibold text-ink-soft text-sm">
          {!connecte
            ? "Connexion à l'arbitre…"
            : adversaireConnecte
              ? `${nomAdverse ?? "L'adversaire"} est dans la salle`
              : "En attente d'un adversaire…"}
        </p>
      </div>

      {/* Composer sans attendre : l'arbitre garde l'équipe, et les deux
          joueurs peuvent préparer la leur en même temps. */}
      <button
        type="button"
        onClick={onComposer}
        className="mt-5 w-full rounded-2xl bg-accent px-5 py-3.5 font-bold text-white shadow-[var(--card-glow)] transition hover:brightness-110"
      >
        Composer mon équipe
      </button>
    </Cadre>
  )
}

/** Ce qu'on attend de l'autre, dit plutôt que laissé à deviner. */
function Attente({ texte, code }: { texte: string; code?: string }) {
  return (
    <Cadre>
      <div className="space-y-3 py-10 text-center">
        <PokeballIcon className="mx-auto size-10 animate-pulse text-accent" />
        <p className="font-bold text-ink">{texte}</p>
        {code && (
          <p className="text-ink-faint text-sm">
            Code de la salle : <span className="font-black tracking-[0.2em]">{code}</span>
          </p>
        )}
      </div>
    </Cadre>
  )
}

/* ------------------------------------------------------------------ *
 * La partie
 * ------------------------------------------------------------------ */

function Partie({ mode, code }: { mode: Mode; code: string | null }) {
  const combat = useCombat(mode, code)
  /*
   * En ligne, on entre par le salon : le code s'y lit en grand, et c'est de
   * là qu'on part composer. Une fois l'équipe validée, on n'y revient pas.
   */
  const [compose, setCompose] = useState(false)
  const naviguer = useNavigate()
  const {
    pokemon,
    chart,
    formesParEspece,
    noms,
    ecran,
    passage,
    enPreparation,
    etat,
    affiche,
    evenements,
    curseur,
    message,
    impact,
  } = combat

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
  const { avancerRecit } = combat

  /*
   * « Quitter » n'a pas le même sens selon le mode. En local il efface la
   * partie sauvegardée ; en ligne il n'y a rien à effacer ici — l'état
   * appartient à l'arbitre — et quitter, c'est simplement sortir de la
   * salle. Elle s'oubliera d'elle-même faute de connexions.
   */
  const quitterOuRejouer = (memesEquipes: boolean) => {
    if (mode === 'ligne' && !memesEquipes) {
      naviguer(CHEMIN('ligne'))
      return
    }
    combat.rejouer(memesEquipes)
  }

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

  /* --- Rendu du mode en ligne, avant la partie ----------------------- */
  const salle = combat.salle

  if (mode === 'ligne' && !salle.configuree) {
    return (
      <Cadre>
        <ErrorScreen
          message="Le combat en ligne n'est pas configuré sur ce déploiement : il lui manque l'adresse de l'arbitre."
          onRetry={() => naviguer('/combat')}
        />
      </Cadre>
    )
  }

  if (mode === 'ligne' && salle.erreur) {
    return (
      <Cadre>
        <ErrorScreen
          message={TEXTE_ERREUR[salle.erreur.raison]}
          onRetry={() => window.location.reload()}
        />
      </Cadre>
    )
  }

  /* --- Rendu --------------------------------------------------------- */
  if (combat.chargement) {
    return (
      <Cadre>
        <LoadingScreen label="Préparation du combat…" />
      </Cadre>
    )
  }

  if (combat.erreur !== null) {
    return (
      <Cadre>
        <ErrorScreen message={combat.erreur ?? 'Chargement impossible'} onRetry={() => void combat.recharger()} />
      </Cadre>
    )
  }

  if (!pokemon) return null

  if (mode === 'ligne' && code) {
    // Tant que l'arbitre n'a pas répondu, il n'y a ni camp ni salle.
    if (!salle.etat) {
      return (
        <Cadre>
          <LoadingScreen label="Connexion à la salle…" />
        </Cadre>
      )
    }

    if (ecran.kind === 'equipe' && !enPreparation && !compose) {
      return (
        <Salon
          code={code}
          nomAdverse={salle.etat.nomAdverse}
          adversaireConnecte={salle.etat.adversaireConnecte}
          connecte={salle.connecte}
          onComposer={() => setCompose(true)}
        />
      )
    }

    if (combat.attente === 'equipe') {
      return (
        <Attente
          code={code}
          texte={
            salle.etat.adversaireConnecte
              ? `En attente de l'équipe de ${salle.etat.nomAdverse ?? "l'adversaire"}…`
              : "En attente d'un adversaire…"
          }
        />
      )
    }
  }

  const enPassage = passage !== null

  return (
    <div className="min-h-dvh">
      {/*
        Une socket coupée ne se voit pas : l'arène reste à l'écran, et les
        coups partent dans le vide. Le bandeau est la seule chose qui
        distingue « l'adversaire réfléchit » de « le lien est tombé ».
      */}
      {mode === 'ligne' && !salle.connecte && (
        <div className="sticky top-0 z-50 bg-amber-500 px-4 py-1.5 text-center font-semibold text-amber-950 text-sm">
          Reconnexion à la salle…
        </div>
      )}

      {enPassage && (
        <PassScreen
          player={passage.vers}
          nom={noms[passage.vers - 1]}
          detail={passage.detail}
          onReady={combat.franchirPassage}
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
            onDone={combat.choisirEquipe}
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
              {combat.capacitesEnErreur ? (
                <ErrorScreen
                  message={
                    navigator.onLine
                      ? 'Impossible de charger les attaques des Pokémon choisis.'
                      : "Hors ligne, et les attaques de ces Pokémon ne sont pas dans ce qui a été téléchargé. Télécharge le dex depuis l'accueil, ou reconnecte-toi."
                  }
                  onRetry={() => void combat.rechargerCapacites()}
                />
              ) : (
                <LoadingScreen label="Préparation du combat…" />
              )}
            </Cadre>
          ) : (
            <Combat
              ecran={ecran}
              moi={combat.moi}
              attente={combat.attente}
              nomAdverse={combat.salle.etat?.nomAdverse ?? null}
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
              onAction={combat.choisirAction}
              onRemplacer={combat.choisirRemplacant}
              onRejouer={quitterOuRejouer}
              enLigne={mode === 'ligne'}
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
  /**
   * Le camp que tient l'appareil, `null` quand il les tient tous les deux.
   * C'est lui qui décide de quel côté du terrain on se place.
   */
  moi: Side | null
  /** En ligne : ce qu'on attend de l'autre, et qui n'arrivera pas d'ici. */
  attente: 'equipe' | 'coup' | 'remplacement' | null
  nomAdverse: string | null
  /** En ligne, les équipes appartiennent à la salle : on ne les change pas seul. */
  enLigne: boolean
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
  moi,
  attente,
  nomAdverse,
  enLigne,
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
   * Chaque joueur voit son propre Pokémon de dos, en bas.
   *
   * Sur un téléphone partagé, la scène pivote donc au fil des écrans —
   * sauf pendant le rejeu et à la fin, où l'on garde la vue du joueur 1 :
   * les deux regardent l'écran ensemble, et faire tourner le terrain
   * pendant qu'ils lisent serait désorientant.
   *
   * Dès qu'un camp appartient à l'appareil — solo, ou en ligne — la scène
   * ne pivote plus jamais : on est toujours en bas de son propre terrain.
   */
  const perspective: Side =
    moi ?? (ecran.kind === 'choix' || ecran.kind === 'remplacement' ? ecran.side : 0)
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
        {/*
          Le coup est parti, l'écran n'a plus rien à proposer : le dire
          explicitement, sinon une arène immobile ressemble à une arène
          figée. C'est la seule différence visible du mode en ligne dans
          l'arène — tout le reste est identique.
        */}
        {attente !== null && attente !== 'equipe' && (
          <div className="flex items-center justify-center gap-3 rounded-2xl border border-line bg-panel-soft px-4 py-6">
            <PokeballIcon className="size-5 animate-pulse text-accent" />
            <p className="font-semibold text-ink-soft text-sm">
              {attente === 'coup'
                ? `${nomAdverse ?? "L'adversaire"} choisit son attaque…`
                : `${nomAdverse ?? "L'adversaire"} envoie son prochain Pokémon…`}
            </p>
          </div>
        )}

        {attente === null && ecran.kind === 'choix' && (
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

        {attente === null && ecran.kind === 'remplacement' && (
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
                {enLigne ? 'Quitter la salle' : 'Nouvelles équipes'}
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
