import type { Ecran, Mode, Passage, Side } from './types'

/**
 * Ce que le mode de jeu change, et lui seul.
 *
 * Le moteur ne sait pas qui joue en face : un tour se résout de la même
 * façon que l'adversaire soit assis à côté, calculé, ou à l'autre bout du
 * réseau. Trois questions seulement dépendent du mode, et elles sont ici
 * plutôt que dispersées en conditions dans la page.
 */

/** Le camp qui doit agir sur cet écran, ou `null` s'il n'attend personne. */
export function coteAttendu(ecran: Ecran): Side | null {
  if (ecran.kind === 'choix' || ecran.kind === 'remplacement') return ecran.side
  if (ecran.kind === 'equipe') return (ecran.joueur - 1) as Side
  return null
}

/**
 * L'écran de passage — « passe le téléphone » — n'a de sens que sur un
 * appareil partagé.
 *
 * Contre l'IA il n'y a personne à qui passer quoi que ce soit ; en ligne,
 * chaque téléphone n'affiche que ses propres écrans et n'a donc rien à
 * cacher. Dans les deux cas on enchaîne directement.
 */
export function passagePour(ecran: Ecran, mode: Mode): Passage | null {
  if (mode !== 'duo') return null

  const side = coteAttendu(ecran)
  if (side === null) return null

  const detail =
    ecran.kind === 'equipe'
      ? 'Compose ton équipe'
      : ecran.kind === 'remplacement'
        ? 'Choisis ton prochain Pokémon'
        : undefined

  return { vers: (side + 1) as 1 | 2, ecran, detail }
}

/**
 * Vrai si c'est à l'appareil de répondre à cet écran.
 *
 * En duo, l'appareil joue les deux camps : tout écran est le sien. Contre
 * l'IA, il tient le camp 0 et l'adversaire se débrouille. En ligne, chacun
 * ne répond que du sien — l'autre écran existe, il se joue ailleurs.
 */
export function aMoiDeJouer(ecran: Ecran, mode: Mode, moi: Side): boolean {
  if (mode === 'duo') return true

  const side = coteAttendu(ecran)
  return side === null || side === moi
}

/** Le camp que tient l'appareil, hors ligne où il dépend de la salle. */
export const MON_COTE: Side = 0

/**
 * Le segment d'URL de chaque mode.
 *
 * Le mode vit dans l'adresse plutôt que dans un état de page : on peut
 * mettre un combat solo en favori, revenir en arrière depuis la sélection,
 * et — le jour où une partie en ligne se partage par lien — le lien porte
 * déjà le bon mode.
 */
export const SEGMENT: Record<Mode, string> = {
  ligne: 'en-ligne',
  duo: 'duo',
  ia: 'solo',
}

export const CHEMIN = (mode: Mode) => `/combat/${SEGMENT[mode]}`

export function modeDepuisSegment(segment: string | undefined): Mode | null {
  const trouve = (Object.keys(SEGMENT) as Mode[]).find((mode) => SEGMENT[mode] === segment)
  return trouve ?? null
}

/** Comment chaque mode se présente au joueur. */
export const LIBELLE: Record<Mode, { titre: string; detail: string }> = {
  ligne: {
    titre: 'Combat en ligne',
    detail: 'Deux téléphones, un code à partager',
  },
  duo: {
    titre: 'À deux sur ce téléphone',
    detail: 'On se le passe, chacun son tour',
  },
  ia: {
    titre: 'Contre le Dresseur',
    detail: 'Un adversaire qui lit la table des types',
  },
}
