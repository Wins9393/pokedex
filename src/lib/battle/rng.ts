/**
 * Générateur pseudo-aléatoire à graine (mulberry32).
 *
 * `Math.random()` suffirait pour jouer à deux sur un téléphone, mais pas
 * pour tester : sans graine, impossible de vérifier qu'un tour donne bien
 * le résultat attendu. Et le jour où le combat passera en réseau, deux
 * `Math.random()` indépendants feraient diverger les deux écrans dès le
 * deuxième tour — chacun tirerait ses propres dégâts et ses propres coups
 * critiques.
 */

export type Rng = () => number

export function createRng(seed: number): Rng {
  let state = seed >>> 0

  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Entier dans `[0, borne[`. */
export const randInt = (rng: Rng, borne: number) => Math.floor(rng() * borne)

/** Graine de départ d'un combat, quand la reproductibilité n'est pas recherchée. */
export const graineAleatoire = () => (Math.random() * 0xffffffff) >>> 0
