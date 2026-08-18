import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import type { TargetAndTransition } from 'motion/react'
import { TypeBadge } from '@/components/ui/TypeBadge'
import { SparklesIcon } from '@/components/ui/icons'
import { AttackEffect, DUREE_EFFET } from './AttackEffect'
import type { Effet } from './AttackEffect'
import { HealthBar } from './HealthBar'
import { ruee } from '@/lib/battle-scene'
import type { Taille } from '@/lib/battle-scene'
import { useReparationImage } from '@/hooks/use-reparation-image'
import { estAuContact } from '@/lib/battle/effects'
import { NIVEAU } from '@/lib/battle/types'
import type { Battler, Side, Team } from '@/lib/battle/types'
import { typeGradient } from '@/lib/pokemon-types'
import { estUnRendu, spritesDeDos, spritesDeFace } from '@/lib/sprites'

/**
 * Taille du cadre en pixels réels.
 *
 * L'effet d'attaque a besoin d'un vrai repère métrique : un pourcentage
 * horizontal et un pourcentage vertical ne mesurent pas la même longueur
 * dans un cadre 4/3, et un rayon tracé en pourcentages raterait sa cible.
 */
function useTaille(cible: React.RefObject<HTMLElement | null>): Taille {
  const [taille, setTaille] = useState<Taille>({ w: 0, h: 0 })

  useEffect(() => {
    const noeud = cible.current
    if (!noeud) return

    const mesurer = () => {
      const rect = noeud.getBoundingClientRect()
      setTaille((precedent) =>
        precedent.w === rect.width && precedent.h === rect.height
          ? precedent
          : { w: rect.width, h: rect.height },
      )
    }

    mesurer()
    const observateur = new ResizeObserver(mesurer)
    observateur.observe(noeud)
    return () => observateur.disconnect()
  }, [cible])

  return taille
}

/**
 * Le sprite Showdown animé manque sur les tout derniers numéros du dex, et
 * la version de dos plus souvent encore. On descend la chaîne de replis à
 * la première erreur de chargement plutôt que d'afficher une image cassée.
 */
function CombatSprite({
  battler,
  dos,
  ko,
}: {
  battler: Battler
  dos: boolean
  ko: boolean
}) {
  const [etape, setEtape] = useState(0)
  const reduit = useReducedMotion()
  /*
   * Un sprite peut avoir été mis en cache cassé par un CDN saturé. Sans
   * cette seconde chance, le combattant se replierait en silence sur une
   * image moins juste — pixel au lieu d'animé, espèce au lieu de forme —
   * pour un fichier qui existe et qu'il suffit d'aller rechercher.
   */
  const { cle, reparer } = useReparationImage()

  const { spriteId: id, dexId, shiny } = battler
  const sources = dos ? spritesDeDos(id, shiny, dexId) : spritesDeFace(id, shiny)
  const index = Math.min(etape, sources.length - 1)

  /*
   * Les sprites du jeu sont du pixel art, et minuscules : la face de
   * Bulbizarre fait 45 × 49 px pour un cadre cinq fois plus grand. Les
   * agrandir en lissant les rend flous ; en pixels nets, c'est le rendu
   * d'origine. Seuls les rendus haute définition — illustration officielle
   * et HOME — restent lissés.
   */
  const pixelise = !estUnRendu(sources[index])

  return (
    <motion.img
      key={cle}
      src={sources[index]}
      alt=""
      onError={() => reparer(sources[index], () => setEtape((valeur) => valeur + 1))}
      initial={reduit ? false : { opacity: 0, y: dos ? 24 : -24, scale: 0.85 }}
      animate={
        ko
          ? { opacity: 0, y: 40, rotate: dos ? -20 : 20, scale: 0.8 }
          : { opacity: 1, y: 0, rotate: 0, scale: 1 }
      }
      transition={reduit ? { duration: 0 } : { duration: 0.45, ease: 'easeOut' }}
      className={`size-full object-contain ${dos ? 'object-bottom' : 'object-center'}`}
      style={{
        imageRendering: pixelise ? 'pixelated' : undefined,
        filter: 'drop-shadow(0 12px 18px rgb(0 0 0 / 0.35))',
      }}
    />
  )
}

/** Les Pokéballs restantes, comme le bandeau d'équipe des jeux. */
function JaugeEquipe({ equipe, aligne }: { equipe: Team; aligne: 'left' | 'right' }) {
  return (
    <div className={`flex gap-1 ${aligne === 'right' ? 'justify-end' : ''}`}>
      {equipe.battlers.map((battler, index) => (
        <span
          key={index}
          title={`${battler.name}${battler.hp <= 0 ? ' — K.O.' : ''}`}
          className={`size-2 rounded-full ${
            battler.hp > 0 ? 'bg-emerald-500' : 'bg-line ring-1 ring-ink-faint/40'
          }`}
        />
      ))}
    </div>
  )
}

function BlocInfos({
  battler,
  equipe,
  cote,
  chiffres,
  retard,
}: {
  battler: Battler
  equipe: Team
  cote: 'left' | 'right'
  chiffres: boolean
  retard: number
}) {
  return (
    <div
      className="w-44 rounded-2xl border border-line px-3 py-2 shadow-[var(--card-glow)] backdrop-blur-sm sm:w-52"
      style={{ backgroundImage: typeGradient(battler.types, 20) }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex min-w-0 items-baseline gap-1">
          <span className="truncate font-black text-ink text-sm">{battler.name}</span>
          {battler.shiny && (
            <SparklesIcon className="size-3 shrink-0 self-center text-amber-400" />
          )}
        </span>
        <span className="shrink-0 font-semibold text-ink-faint text-xs">N.{NIVEAU}</span>
      </div>

      <div className="mt-1.5">
        <HealthBar hp={battler.hp} maxHp={battler.maxHp} chiffres={chiffres} retard={retard} />
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2">
        <div className="flex gap-1">
          {battler.types.map((type) => (
            <TypeBadge key={type} type={type} size="xs" />
          ))}
        </div>
        <JaugeEquipe equipe={equipe} aligne={cote === 'right' ? 'right' : 'left'} />
      </div>
    </div>
  )
}

type Props = {
  /** Index 0 = joueur du bas (celui qui joue), 1 = adversaire en haut. */
  joueur: { battler: Battler; equipe: Team }
  adversaire: { battler: Battler; equipe: Team }
  /** Camp affiché en bas — sert à traduire les camps du moteur en places à l'écran. */
  perspective: Side
  /** Camp qui vient d'encaisser un coup, pour la secousse. */
  impact: Side | null
  /** Le geste en cours, `null` hors du moment de la frappe. */
  effet: (Omit<Effet, 'depuis'> & { side: Side }) | null
}

/**
 * Disposition canonique du combat : adversaire de face en haut à droite,
 * Pokémon du joueur de dos en bas à gauche. C'est ce placement — plus que
 * les couleurs — qui fait immédiatement reconnaître un combat Pokémon.
 */
export function BattleArena({ joueur, adversaire, perspective, impact, effet }: Props) {
  const reduit = useReducedMotion()
  const cadre = useRef<HTMLDivElement>(null)
  const taille = useTaille(cadre)

  /** Place à l'écran d'un camp du moteur : 0 en bas, 1 en haut. */
  const place = (side: Side) => ((side === perspective ? 0 : 1) as Side)
  const geste = effet && !reduit ? { ...effet, depuis: place(effet.side) } : null

  /**
   * Un sprite ne fait jamais qu'une chose à la fois : il se rue s'il frappe
   * au contact, il encaisse s'il est touché. Les deux animent `x`, d'où une
   * seule fonction — et jamais le même camp, l'attaquant n'encaissant pas
   * son propre coup.
   */
  const animation = (side: Side): TargetAndTransition => {
    if (reduit) return {}

    if (geste && geste.side === side && estAuContact(geste.archetype)) {
      const elan = ruee(place(side), taille)
      return {
        x: [0, elan.x, 0],
        y: [0, elan.y, 0],
        // Le sommet de la ruée tombe pile à `DUREE_EFFET`, l'instant où
        // l'entaille se trace et où la jauge s'ébranle.
        transition: { duration: DUREE_EFFET * 2, times: [0, 0.5, 1], ease: 'easeInOut' },
      }
    }

    if (impact === side) {
      // Retardée du temps de trajet : on ne recule pas avant d'être frappé.
      return { x: [0, -8, 8, -5, 5, 0], transition: { duration: 0.34, delay: DUREE_EFFET } }
    }

    return {}
  }

  const adverse = (1 - perspective) as Side

  return (
    <div
      ref={cadre}
      className="relative mx-auto aspect-[4/3] w-full max-w-2xl overflow-hidden rounded-3xl border border-line bg-panel-soft sm:aspect-[16/10]"
    >
      {/* Sol stylisé : deux ellipses qui posent les Pokémon dans l'espace
          sans imiter les décors des jeux, qu'on n'a pas le droit d'utiliser. */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 38% 12% at 72% 46%, color-mix(in oklab, var(--ink) 12%, transparent), transparent 70%), radial-gradient(ellipse 44% 13% at 28% 88%, color-mix(in oklab, var(--ink) 14%, transparent), transparent 70%)',
        }}
      />

      {/* Les blocs de PV passent au-dessus de l'effet : un rayon peut
          traverser la scène, pas masquer la jauge au moment où elle tombe. */}
      <div className="absolute top-3 left-3 z-30 sm:top-4 sm:left-4">
        <BlocInfos
          battler={adversaire.battler}
          equipe={adversaire.equipe}
          cote="left"
          chiffres={false}
          retard={impact === adverse ? DUREE_EFFET : 0}
        />
      </div>

      {/*
        Boîtes carrées obtenues par `aspect-square` et non par `size-[n%]` :
        un pourcentage se rapporte à la largeur pour l'une des dimensions et
        à la hauteur pour l'autre, ce qui donne un cadre aplati dans lequel
        les sprites se retrouvent tassés.

        L'adversaire est plus petit que le Pokémon du joueur : c'est ce qui
        crée la profondeur, l'un étant au fond de la scène et l'autre au
        premier plan.
      */}
      <motion.div
        animate={animation(adverse)}
        className="absolute top-[6%] right-[8%] z-10 aspect-square w-[30%] sm:w-[28%]"
      >
        {/*
          La clé porte sur le composant et non sur l'image : c'est lui qui
          retient l'étape de repli atteinte. Sans remontage, un Pokémon qui
          entre après un autre dont le sprite manquait démarrerait sur le
          repli de son prédécesseur.
        */}
        <CombatSprite
          key={adversaire.battler.spriteId}
          battler={adversaire.battler}
          dos={false}
          ko={adversaire.battler.hp <= 0}
        />
      </motion.div>

      <motion.div
        animate={animation(perspective)}
        className="absolute bottom-[16%] left-[7%] z-10 aspect-square w-[40%] sm:w-[36%]"
      >
        <CombatSprite
          key={joueur.battler.spriteId}
          battler={joueur.battler}
          dos
          ko={joueur.battler.hp <= 0}
        />
      </motion.div>

      {/* Remonté à chaque étape : sans clé, `motion` reprendrait l'animation
          en cours au lieu de rejouer le geste depuis son départ. */}
      {geste && <AttackEffect key={geste.cle} effet={geste} taille={taille} />}

      <div className="absolute right-3 bottom-3 z-30 sm:right-4 sm:bottom-4">
        <BlocInfos
          battler={joueur.battler}
          equipe={joueur.equipe}
          cote="right"
          chiffres
          retard={impact === perspective ? DUREE_EFFET : 0}
        />
      </div>
    </div>
  )
}
