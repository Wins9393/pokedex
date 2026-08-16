import type { BattleEvent } from './types'

/**
 * Le récit d'un tour, en français.
 *
 * Renvoyer `null` n'est pas un oubli : les dégâts n'ont pas de phrase
 * propre dans les jeux, la barre de vie qui descend suffit. L'interface
 * conserve alors le message précédent le temps de l'animation.
 */
export function texteEvenement(event: BattleEvent): string | null {
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
      return `Joueur ${event.side + 1} remporte le combat !`
    case 'damage':
      return null
  }
}

/**
 * Durée d'affichage d'un événement. Les dégâts tiennent l'écran un peu
 * plus longtemps que le reste : c'est le moment où la barre de vie
 * s'anime, et l'enchaîner trop vite rend le combat illisible.
 */
export function dureeEvenement(event: BattleEvent): number {
  switch (event.kind) {
    case 'damage':
      return 700
    case 'critical':
    case 'effectiveness':
      return 750
    case 'faint':
    case 'win':
      return 1100
    default:
      return 900
  }
}
