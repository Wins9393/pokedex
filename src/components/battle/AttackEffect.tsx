import { motion } from 'motion/react'
import type { CSSProperties, ReactNode } from 'react'
import { repere } from '@/lib/battle-scene'
import type { Repere, Taille } from '@/lib/battle-scene'
import type { Archetype } from '@/lib/battle/effects'
import type { Side } from '@/lib/battle/types'
import { typeColor } from '@/lib/pokemon-types'
import type { TypeName } from '@/lib/pokemon-types'

/**
 * Durée du geste, en secondes — du départ du coup à son arrivée.
 *
 * Exportée comme `DUREE_JAUGE` et pour la même raison : la jauge de PV, la
 * secousse et l'enchaînement de l'étape muette s'y accrochent tous. Une
 * valeur recopiée les ferait dériver, et on verrait les PV tomber avant que
 * le coup ait touché — l'erreur exacte que l'ordre des événements corrige.
 */
export const DUREE_EFFET = 0.36

export type Effet = {
  /** Change à chaque étape du récit : c'est la clé de remontage du geste. */
  cle: number
  archetype: Archetype
  type: TypeName
  /** Place de l'attaquant à l'écran — voir `ANCRES`. */
  depuis: Side
  /** L'attaque a manqué : le coup file au-delà de la cible, sans impact. */
  rate: boolean
}

/**
 * Change de repère : à l'intérieur, `x` court le long du trajet et `y` s'en
 * écarte perpendiculairement, quel que soit le placement des deux Pokémon.
 *
 * Une boîte de 0 × 0 tourne autour de son propre point d'ancrage sans avoir
 * à corriger de `transform-origin`, et surtout la rotation vit ici, en CSS
 * statique : `motion` garde la main sur les transformations qu'il anime —
 * `scaleX`, `x`, `y` — sans jamais écraser l'angle.
 */
function Axe({ geo, children }: { geo: Repere; children: ReactNode }) {
  return (
    <div
      className="absolute size-0"
      style={{ left: geo.ax, top: geo.ay, transform: `rotate(${geo.angle}deg)` }}
    >
      {children}
    </div>
  )
}

/*
 * Un effet se lit par contraste avec le fond, pas par sa clarté.
 *
 * Blanchir le cœur donne une belle incandescence sur le thème sombre et
 * fait disparaître l'attaque sur le clair, où elle se noie dans la page.
 * On pousse donc la teinte du type vers `--ink` — la couleur du texte, donc
 * par construction celle qui tranche sur le fond du thème en cours :
 * l'effet devient blanc sur le sombre et profond sur le clair, sans que
 * rien ici n'ait à connaître le thème.
 */
const braise = (couleur: string) => `color-mix(in oklab, var(--ink) 74%, ${couleur})`
const noyau = (couleur: string) => `color-mix(in oklab, var(--ink) 40%, ${couleur})`

/** Trait posé sur l'axe, centré sur lui. */
const barre = (x: number, longueur: number, epaisseur: number): CSSProperties => ({
  position: 'absolute',
  left: x,
  top: -epaisseur / 2,
  width: longueur,
  height: epaisseur,
  borderRadius: 9999,
})

/** Disque centré sur un point de l'axe. */
const disque = (x: number, diametre: number): CSSProperties => ({
  position: 'absolute',
  left: x - diametre / 2,
  top: -diametre / 2,
  width: diametre,
  height: diametre,
  borderRadius: 9999,
})

/* ------------------------------------------------------------------ *
 * Les six gestes
 * ------------------------------------------------------------------ */

/** Rayon continu qui se déploie de l'attaquant vers sa cible. */
function Faisceau({ geo, couleur }: { geo: Repere; couleur: string }) {
  const halo = `linear-gradient(90deg, transparent 0%, ${couleur} 16%, ${noyau(couleur)} 62%, ${couleur} 92%, transparent 100%)`

  return (
    <>
      {/* Deux couches : un halo diffus qui donne la masse, un cœur net qui
          donne la brûlure. Le rayon s'allonge, il n'apparaît pas d'un bloc. */}
      {[
        { epaisseur: 22 * geo.k, flou: 7 * geo.k, fond: halo, opacite: 0.75 },
        { epaisseur: 5 * geo.k, flou: 0, fond: `linear-gradient(90deg, transparent, ${noyau(couleur)} 30%, ${braise(couleur)} 60%, ${noyau(couleur)} 88%, transparent)`, opacite: 1 },
      ].map((couche) => (
        <motion.div
          key={couche.epaisseur}
          style={{
            ...barre(0, geo.portee, couche.epaisseur),
            background: couche.fond,
            filter: couche.flou ? `blur(${couche.flou}px)` : undefined,
            transformOrigin: '0% 50%',
          }}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{ scaleX: 1, opacity: [0, couche.opacite, couche.opacite, 0] }}
          transition={{
            scaleX: { duration: DUREE_EFFET * 0.62, ease: 'easeOut' },
            opacity: { duration: DUREE_EFFET + 0.2, times: [0, 0.18, 0.7, 1] },
          }}
        />
      ))}

      {/* Départ du tir, au canon. */}
      <motion.div
        style={{
          position: 'absolute',
          left: -22 * geo.k,
          top: -22 * geo.k,
          width: 44 * geo.k,
          height: 44 * geo.k,
          borderRadius: 9999,
          background: `radial-gradient(circle, ${braise(couleur)} 0%, ${couleur} 45%, transparent 72%)`,
        }}
        initial={{ scale: 0.2, opacity: 0.95 }}
        animate={{ scale: 1.7, opacity: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      />
    </>
  )
}

/** Sphère lancée en cloche, suivie de sa traînée. */
function Projectile({ geo, couleur }: { geo: Repere; couleur: string }) {
  const taille = 46 * geo.k
  // La cloche s'écarte perpendiculairement au trajet : dans le repère de
  // l'axe, il suffit de creuser `y`.
  const cloche = -Math.min(52, geo.portee * 0.17)

  return (
    <>
      {[3, 2, 1, 0].map((rang) => (
        <motion.div
          key={rang}
          style={{
            position: 'absolute',
            left: -taille / 2,
            top: -taille / 2,
            width: taille,
            height: taille,
            borderRadius: 9999,
            background: `radial-gradient(circle at 34% 32%, ${braise(couleur)} 0%, ${noyau(couleur)} 30%, ${couleur} 62%, transparent 76%)`,
            boxShadow: rang === 0 ? `0 0 ${30 * geo.k}px ${couleur}` : undefined,
          }}
          initial={{ x: 0, y: 0, scale: 0.4, opacity: 0 }}
          animate={{
            x: [0, geo.portee * 0.5, geo.portee],
            y: [0, cloche, 0],
            scale: [0.4, 1 - rang * 0.13, 1 - rang * 0.2],
            // La traînée s'éteint avant l'arrivée : sans quoi les fantômes
            // continueraient de traverser la cible après l'impact.
            opacity: rang === 0 ? [0, 1, 1] : [0, 0.5 - rang * 0.12, 0],
          }}
          transition={{ duration: DUREE_EFFET, delay: rang * 0.038, ease: 'easeInOut' }}
        />
      ))}
    </>
  )
}

/** Fronts d'onde concentriques qui roulent vers la cible. */
function Onde({ geo, couleur }: { geo: Repere; couleur: string }) {
  return (
    <>
      {[0, 1, 2, 3].map((rang) => (
        <motion.div
          key={rang}
          style={{
            position: 'absolute',
            // Étroit dans le sens du trajet, haut en travers : un front
            // d'onde, pas une bulle.
            left: -26 * geo.k,
            top: -50 * geo.k,
            width: 52 * geo.k,
            height: 100 * geo.k,
            borderRadius: '50%',
            border: `${3.5 * geo.k}px solid ${couleur}`,
            boxShadow: `0 0 ${18 * geo.k}px ${couleur}, inset 0 0 ${16 * geo.k}px ${couleur}`,
          }}
          initial={{ x: 0, scale: 0.3, opacity: 0 }}
          animate={{ x: geo.portee * 0.88, scale: 1.9, opacity: [0, 0.95, 0] }}
          transition={{ duration: DUREE_EFFET + 0.12, delay: rang * 0.07, ease: 'easeOut' }}
        />
      ))}
    </>
  )
}

/** Deux entailles croisées, tracées coup sur coup sur la cible. */
function Entaille({ geo, couleur }: { geo: Repere; couleur: string }) {
  const longueur = 108 * geo.k

  return (
    <>
      {[36, -36].map((inclinaison, rang) => (
        // Rotation figée à l'extérieur, tracé animé à l'intérieur : même
        // partage des rôles que dans `Axe`.
        <div
          key={inclinaison}
          style={{
            ...barre(geo.portee - longueur / 2, longueur, 7 * geo.k),
            transform: `rotate(${inclinaison}deg)`,
          }}
        >
          <motion.div
            className="size-full rounded-full"
            style={{
              background: `linear-gradient(90deg, transparent, ${noyau(couleur)} 22%, ${braise(couleur)} 50%, ${noyau(couleur)} 78%, transparent)`,
              filter: `drop-shadow(0 0 ${8 * geo.k}px ${couleur})`,
              transformOrigin: rang === 0 ? '0% 50%' : '100% 50%',
            }}
            initial={{ scaleX: 0, opacity: 1 }}
            animate={{ scaleX: 1, opacity: [1, 1, 0] }}
            transition={{
              scaleX: { duration: 0.14, delay: DUREE_EFFET - 0.1 + rang * 0.07, ease: 'easeOut' },
              opacity: { duration: 0.34, delay: DUREE_EFFET - 0.1 + rang * 0.07, times: [0, 0.45, 1] },
            }}
          />
        </div>
      ))}
    </>
  )
}

/** Onde de choc sèche, pour les coups de poing. */
function Choc({ geo, couleur }: { geo: Repere; couleur: string }) {
  const anneau = 46 * geo.k

  return (
    <>
      <motion.div
        style={{
          position: 'absolute',
          left: geo.portee - anneau / 2,
          top: -anneau / 2,
          width: anneau,
          height: anneau,
          borderRadius: 9999,
          border: `${4 * geo.k}px solid ${noyau(couleur)}`,
          boxShadow: `0 0 ${16 * geo.k}px ${couleur}`,
        }}
        initial={{ scale: 0.2, opacity: 1 }}
        animate={{ scale: 2.4, opacity: 0 }}
        transition={{ duration: 0.22, delay: DUREE_EFFET - 0.05, ease: 'easeOut' }}
      />

      {/* Lignes de force : le poing chasse l'air autour de lui. */}
      {[0, 72, 144, 216, 288].map((angle) => (
        <div
          key={angle}
          style={{
            ...barre(geo.portee, 30 * geo.k, 4 * geo.k),
            transform: `rotate(${angle}deg)`,
            transformOrigin: '0% 50%',
          }}
        >
          <motion.div
            className="size-full rounded-full"
            style={{ background: couleur }}
            initial={{ x: 6 * geo.k, opacity: 0.9, scaleX: 1 }}
            animate={{ x: 34 * geo.k, opacity: 0, scaleX: 0.3 }}
            transition={{ duration: 0.26, delay: DUREE_EFFET - 0.04, ease: 'easeOut' }}
          />
        </div>
      ))}
    </>
  )
}

/** Deux mâchoires qui se referment sur la cible. */
function Morsure({ geo, couleur }: { geo: Repere; couleur: string }) {
  const gueule = 70 * geo.k

  return (
    <>
      {[
        { signe: -1, cote: 'borderTopColor' as const },
        { signe: 1, cote: 'borderBottomColor' as const },
      ].map(({ signe, cote }) => (
        <motion.div
          key={signe}
          style={{
            position: 'absolute',
            left: geo.portee - gueule / 2,
            top: -gueule / 2,
            width: gueule,
            height: gueule,
            borderRadius: '50%',
            border: `${7 * geo.k}px solid transparent`,
            [cote]: couleur,
            filter: `drop-shadow(0 0 ${9 * geo.k}px ${couleur})`,
          }}
          initial={{ y: signe * 34 * geo.k, opacity: 0, scale: 1.15 }}
          animate={{
            y: [signe * 34 * geo.k, signe * 3 * geo.k, signe * 3 * geo.k],
            opacity: [0, 1, 0],
            scale: [1.15, 1, 0.94],
          }}
          transition={{ duration: 0.42, delay: DUREE_EFFET - 0.18, times: [0, 0.45, 1], ease: 'easeOut' }}
        />
      ))}
    </>
  )
}

/**
 * L'éclat commun à tous les gestes, au point de contact.
 *
 * Trois couches qui font la lecture d'un choc : une boule de lumière qui
 * gonfle et retombe, un anneau qui s'échappe vers l'extérieur, et quelques
 * éclats courts. Ce sont les éclats qu'il faut tenir en bride — longs et
 * fins, ils donnent une étincelle décorative là où l'on veut un impact.
 */
/**
 * Angles et longueurs volontairement irréguliers.
 *
 * Six éclats répartis tous les 60° et de même taille dessinent un flocon :
 * l'œil y lit une étoile décorative, pas une projection de matière. Le
 * désordre est ce qui fait la différence, et il doit rester fixe — tiré au
 * sort à chaque coup, il ferait scintiller la scène sans raison.
 */
const ECLATS = [
  { angle: 14, part: 1 },
  { angle: 67, part: 0.7 },
  { angle: 121, part: 0.95 },
  { angle: 168, part: 0.62 },
  { angle: 232, part: 0.88 },
  { angle: 297, part: 0.76 },
]

function Impact({ geo, couleur }: { geo: Repere; couleur: string }) {
  const boule = 118 * geo.k
  const anneau = 44 * geo.k

  return (
    <>
      {/* Le cœur : c'est lui qui doit dominer, les éclats ne font que le
          prolonger. Il tient plus longtemps qu'eux pour cette raison. */}
      <motion.div
        style={{
          ...disque(geo.portee, boule),
          background: `radial-gradient(circle, ${braise(couleur)} 0%, ${noyau(couleur)} 34%, ${couleur} 56%, transparent 74%)`,
        }}
        initial={{ scale: 0.15, opacity: 1 }}
        animate={{ scale: [0.15, 1.15, 1], opacity: [1, 1, 0] }}
        transition={{ duration: 0.44, delay: DUREE_EFFET, times: [0, 0.22, 1], ease: 'easeOut' }}
      />

      <motion.div
        style={{
          ...disque(geo.portee, anneau),
          border: `${3 * geo.k}px solid ${noyau(couleur)}`,
        }}
        initial={{ scale: 0.35, opacity: 0.9 }}
        animate={{ scale: 3.1, opacity: 0 }}
        transition={{ duration: 0.42, delay: DUREE_EFFET, ease: 'easeOut' }}
      />

      {ECLATS.map(({ angle, part }, rang) => (
        <div
          key={angle}
          style={{
            ...barre(geo.portee, 30 * geo.k * part, 8 * geo.k),
            transform: `rotate(${angle}deg)`,
            transformOrigin: '0% 50%',
          }}
        >
          <motion.div
            className="size-full rounded-full"
            style={{ background: `linear-gradient(90deg, ${braise(couleur)}, ${couleur} 60%, transparent)` }}
            initial={{ x: 10 * geo.k, opacity: 1, scaleX: 1 }}
            animate={{ x: 36 * geo.k * part, opacity: 0, scaleX: 0.35 }}
            transition={{ duration: 0.28, delay: DUREE_EFFET + rang * 0.008, ease: 'easeOut' }}
          />
        </div>
      ))}
    </>
  )
}

/* ------------------------------------------------------------------ *
 * Assemblage
 * ------------------------------------------------------------------ */

const GESTES: Record<Archetype, (props: { geo: Repere; couleur: string }) => ReactNode> = {
  faisceau: Faisceau,
  projectile: Projectile,
  onde: Onde,
  melee: Entaille,
  poing: Choc,
  morsure: Morsure,
}

/**
 * L'animation d'un coup, dessinée entièrement en CSS.
 *
 * Aucun visuel n'est téléchargé : PokéAPI n'expose pas de sprite d'attaque,
 * et ce qu'on dessine ici couvre les 394 attaques du jeu — y compris celles
 * que personne n'a jamais illustrées. Le hors-ligne n'a donc rien de plus à
 * mettre en cache.
 */
export function AttackEffect({ effet, taille }: { effet: Effet; taille: Taille }) {
  const Geste = GESTES[effet.archetype]
  /*
   * Le cadre pas encore mesuré, ou un geste inconnu — une donnée d'attaque
   * d'une version antérieure, remontée du cache persisté : on ne dessine
   * rien. Le combat, lui, continue. Une décoration ne fait pas tomber une
   * partie en cours.
   */
  if (taille.w === 0 || !Geste) return null

  const geo = repere(effet.depuis, taille, effet.rate)
  const couleur = typeColor(effet.type)

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20">
      <Axe geo={geo}>
        <Geste geo={geo} couleur={couleur} />
        {!effet.rate && <Impact geo={geo} couleur={couleur} />}
      </Axe>

      {/*
        L'embrasement de la scène, ce qui fait ressentir la frappe — et ce
        qui porte la teinte du type sur les deux thèmes. En dégradé depuis
        le point de contact et non à plat sur tout le cadre : une teinte
        uniforme lave l'image au lieu d'éclairer un endroit.
      */}
      {!effet.rate && (
        <motion.div
          className="absolute inset-0"
          style={{
            background: `radial-gradient(circle ${Math.round(geo.portee * 0.7)}px at ${Math.round(geo.bx)}px ${Math.round(geo.by)}px, ${couleur} 0%, transparent 72%)`,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.34, 0] }}
          transition={{ duration: 0.3, delay: DUREE_EFFET, times: [0, 0.22, 1] }}
        />
      )}
    </div>
  )
}
