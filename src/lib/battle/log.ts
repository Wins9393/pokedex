import { NOMS_PAR_DEFAUT } from './noms'
import type { Noms } from './noms'
import type { BattleEvent } from './types'

/**
 * Le récit d'un tour, en français.
 *
 * Renvoyer `null` n'est pas un oubli : les dégâts n'ont pas de phrase
 * propre dans les jeux, la barre de vie qui descend suffit. L'interface
 * conserve alors la ligne précédente pendant que la jauge se vide — c'est
 * bien une étape à part entière, qui attend sa tape comme les autres.
 *
 * Les noms des joueurs arrivent en paramètre plutôt que d'être lus ici :
 * c'est le seul endroit du moteur qui nomme quelqu'un, et il n'a pas à
 * connaître le stockage qui les retient.
 */
export function texteEvenement(event: BattleEvent, noms: Noms = NOMS_PAR_DEFAUT): string | null {
  switch (event.kind) {
    case 'switch':
      return `${event.to} entre en jeu !`
    case 'move':
      return `${event.user} utilise ${event.move} !`
    case 'miss':
      return `${event.user} rate son attaque…`
    case 'immune':
      return `Ça n'affecte pas ${event.target}…`
    case 'critical':
      return 'Coup critique !'
    case 'effectiveness':
      return event.multiplier > 1 ? "C'est super efficace !" : "Ce n'est pas très efficace…"
    case 'faint':
      return `${event.target} est K.O. !`
    case 'win':
      return `${noms[event.side]} remporte le combat !`
    case 'damage':
      return null
  }
}

/**
 * Vrai si l'événement ne fait qu'agir à l'écran, sans rien dire — les
 * dégâts, aujourd'hui les seuls.
 *
 * Ces étapes-là existent bel et bien : la jauge qui se vide est le paiement
 * de l'attaque annoncée juste avant, et c'est la tape donnée sur cette
 * annonce qui la déclenche. Mais on ne tape pas pour en sortir : il n'y a
 * rien de nouveau à lire, et la tape ne ferait que congédier une phrase
 * déjà lue. Elles s'enchaînent donc d'elles-mêmes, une fois l'animation
 * passée — voir `DUREE_JAUGE`.
 *
 * Sans les noms : ce qui rend une étape muette ne dépend pas d'eux, et les
 * lui passer laisserait croire le contraire.
 */
export const estMuet = (event: BattleEvent) => texteEvenement(event) === null
