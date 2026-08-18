/**
 * Les noms des deux joueurs.
 *
 * Un nom n'appartient pas à un combat mais au téléphone : il doit survivre
 * à « Rejouer » et à « Quitter », c'est-à-dire précisément à ce qui efface
 * la partie en cours. Il vit donc sous sa propre clé, et **la sauvegarde du
 * combat n'en contient aucun** — elle ne connaît que les camps. Sans quoi
 * se renommer laisserait l'ancien pseudo figé dans un combat repris.
 */
export type Noms = readonly [string, string]

export const NOMS_PAR_DEFAUT: Noms = ['Joueur 1', 'Joueur 2']

/**
 * Plafond de saisie, mesuré et non deviné — mais il ne suffit pas à lui
 * seul. Sur les 327 px d'un écran de 375, l'écran de passage affiche le nom
 * en 36 px gras : neuf capitales larges y débordent déjà quand seize
 * caractères courants tiennent. Aucun plafond ne peut donc servir les deux
 * cas. Celui-ci garde les prénoms réels intacts, et c'est le titre qui
 * cède — il passe à la ligne plutôt que de tronquer quelqu'un.
 */
export const NOM_MAX = 14

/** Ce qui a été tapé n'est pas ce qui s'affiche : un champ vidé revient au défaut. */
export const nomAffiche = (saisi: string, side: 0 | 1) =>
  saisi.trim() || NOMS_PAR_DEFAUT[side]

export const nettoyerNom = (brut: string) => brut.replace(/\s+/g, ' ').trimStart().slice(0, NOM_MAX)
