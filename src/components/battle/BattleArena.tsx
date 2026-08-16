import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { TypeBadge } from '@/components/ui/TypeBadge'
import { HealthBar } from './HealthBar'
import { NIVEAU } from '@/lib/battle/types'
import type { Battler, Side, Team } from '@/lib/battle/types'
import { typeGradient } from '@/lib/pokemon-types'
import { artworkUrl, pixelBackUrl, showdownBackUrl, showdownUrl } from '@/lib/sprites'

/**
 * Le sprite Showdown animé manque sur les tout derniers numéros du dex, et
 * la version de dos plus souvent encore. On descend la chaîne de replis à
 * la première erreur de chargement plutôt que d'afficher une image cassée.
 */
function CombatSprite({ id, dos, ko }: { id: number; dos: boolean; ko: boolean }) {
  const [etape, setEtape] = useState(0)
  const reduit = useReducedMotion()

  const sources = dos
    ? [showdownBackUrl(id), pixelBackUrl(id)]
    : [showdownUrl(id), artworkUrl(id)]
  const index = Math.min(etape, sources.length - 1)

  /*
   * Les sprites du jeu sont du pixel art, et minuscules : la face de
   * Bulbizarre fait 45 × 49 px pour un cadre cinq fois plus grand. Les
   * agrandir en lissant les rend flous ; en pixels nets, c'est le rendu
   * d'origine. Seule l'illustration officielle, qui est un rendu haute
   * définition, doit rester lissée.
   */
  const pixelise = !sources[index].includes('official-artwork')

  return (
    <motion.img
      key={id}
      src={sources[index]}
      alt=""
      onError={() => setEtape((valeur) => valeur + 1)}
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
}: {
  battler: Battler
  equipe: Team
  cote: 'left' | 'right'
  chiffres: boolean
}) {
  return (
    <div
      className="w-44 rounded-2xl border border-line px-3 py-2 shadow-[var(--card-glow)] backdrop-blur-sm sm:w-52"
      style={{ backgroundImage: typeGradient(battler.types, 20) }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-black text-ink text-sm">{battler.name}</span>
        <span className="shrink-0 font-semibold text-ink-faint text-xs">N.{NIVEAU}</span>
      </div>

      <div className="mt-1.5">
        <HealthBar hp={battler.hp} maxHp={battler.maxHp} chiffres={chiffres} />
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
  /** Côté qui vient d'encaisser un coup, pour la secousse. */
  impact: Side | null
}

/**
 * Disposition canonique du combat : adversaire de face en haut à droite,
 * Pokémon du joueur de dos en bas à gauche. C'est ce placement — plus que
 * les couleurs — qui fait immédiatement reconnaître un combat Pokémon.
 */
export function BattleArena({ joueur, adversaire, impact }: Props) {
  const reduit = useReducedMotion()
  const secousse = (touche: boolean) =>
    reduit || !touche ? {} : { x: [0, -8, 8, -5, 5, 0], transition: { duration: 0.34 } }

  return (
    <div className="relative mx-auto aspect-[4/3] w-full max-w-2xl overflow-hidden rounded-3xl border border-line bg-panel-soft sm:aspect-[16/10]">
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

      <div className="absolute top-3 left-3 sm:top-4 sm:left-4">
        <BlocInfos
          battler={adversaire.battler}
          equipe={adversaire.equipe}
          cote="left"
          chiffres={false}
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
        animate={secousse(impact === 1)}
        className="absolute top-[6%] right-[8%] aspect-square w-[30%] sm:w-[28%]"
      >
        <CombatSprite id={adversaire.battler.id} dos={false} ko={adversaire.battler.hp <= 0} />
      </motion.div>

      <motion.div
        animate={secousse(impact === 0)}
        className="absolute bottom-[16%] left-[7%] aspect-square w-[40%] sm:w-[36%]"
      >
        <CombatSprite id={joueur.battler.id} dos ko={joueur.battler.hp <= 0} />
      </motion.div>

      <div className="absolute right-3 bottom-3 sm:right-4 sm:bottom-4">
        <BlocInfos battler={joueur.battler} equipe={joueur.equipe} cote="right" chiffres />
      </div>
    </div>
  )
}
