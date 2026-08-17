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
 * Découpe le récit d'un tour en **répliques** : une phrase, suivie de tout
 * ce qui l'accompagne sans rien dire — la chute de la barre de vie, pour
 * l'essentiel.
 *
 * C'est l'unité que le joueur fait avancer d'une tape, et le groupement
 * n'est pas cosmétique : une tape qui ne changerait aucun mot à l'écran
 * passerait pour une tape ignorée. Sur 528 tours simulés, un tour compte
 * cinq événements en médiane mais seulement **trois répliques**.
 *
 * Un événement muet qui n'en suit aucun autre forme sa propre réplique
 * plutôt que d'être perdu — cas qui ne se produit pas aujourd'hui, les
 * dégâts suivant toujours une attaque, mais qui ne coûte rien à couvrir.
 */
export function grouperEnRepliques(events: readonly BattleEvent[]): BattleEvent[][] {
  const repliques: BattleEvent[][] = []

  for (const event of events) {
    const courante = repliques[repliques.length - 1]
    if (texteEvenement(event) !== null || !courante) repliques.push([event])
    else courante.push(event)
  }

  return repliques
}
