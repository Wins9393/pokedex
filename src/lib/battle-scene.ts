import type { Side } from './battle/types'

/**
 * La géométrie de l'arène : où se tiennent les deux combattants, et comment
 * aller de l'un à l'autre.
 *
 * Volontairement hors de `lib/battle/`, qui est le moteur : rien ici ne
 * concerne les règles du jeu, et le moteur doit rester jouable sans écran —
 * c'est ce qui permettra de le partager avec un mode en ligne.
 */

export type Taille = { w: number; h: number }

/**
 * Position des combattants, en fraction de l'arène.
 *
 * Indexé par **place à l'écran** et non par camp : 0 est celui du bas, au
 * premier plan (son sprite est calé en bas de son cadre, d'où un point plus
 * bas que le centre géométrique), 1 celui du haut, plus petit et plus
 * lointain. C'est `BattleArena` qui traduit le camp en place, et ces points
 * suivent les cadres posés là-bas : les déplacer oblige à retoucher ici.
 */
export const ANCRES: Record<Side, { x: number; y: number }> = {
  0: { x: 0.27, y: 0.62 },
  1: { x: 0.77, y: 0.28 },
}

/**
 * Repère du coup : origine, angle et longueur du trajet, en pixels réels.
 *
 * En pixels et non en pourcentages parce qu'un pourcentage horizontal et un
 * pourcentage vertical ne mesurent pas la même longueur dans un cadre 4/3 :
 * un trait tracé ainsi ne pointerait pas sur sa cible.
 */
export function repere(depuis: Side, taille: Taille, rate: boolean) {
  const depart = ANCRES[depuis]
  const arrivee = ANCRES[(1 - depuis) as Side]
  const ax = depart.x * taille.w
  const ay = depart.y * taille.h
  const dx = arrivee.x * taille.w - ax
  const dy = arrivee.y * taille.h - ay

  return {
    ax,
    ay,
    /** Point visé, hors du repère tourné — pour ce qui doit rester d'aplomb. */
    bx: ax + dx,
    by: ay + dy,
    angle: (Math.atan2(dy, dx) * 180) / Math.PI,
    /** Un coup manqué dépasse sa cible plutôt que de s'arrêter dessus. */
    portee: Math.hypot(dx, dy) * (rate ? 1.32 : 1),
    /** Les tailles décoratives suivent l'arène, sinon un éclat couvre un écran de 360 px. */
    k: Math.min(1, Math.max(0.55, taille.w / 640)),
  }
}

export type Repere = ReturnType<typeof repere>

/**
 * Décalage de la ruée d'un attaquant au contact, en pixels : il se jette au
 * tiers du chemin plutôt que sur sa cible, ce qui suffit à lire l'élan sans
 * que les deux sprites se chevauchent.
 */
export function ruee(depuis: Side, taille: Taille) {
  const depart = ANCRES[depuis]
  const arrivee = ANCRES[(1 - depuis) as Side]
  return {
    x: (arrivee.x - depart.x) * taille.w * 0.34,
    y: (arrivee.y - depart.y) * taille.h * 0.34,
  }
}
