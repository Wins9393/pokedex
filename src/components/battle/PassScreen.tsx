import { motion, useReducedMotion } from 'motion/react'
import { PokeballIcon } from '@/components/ui/icons'
import { useTapLock } from '@/hooks/use-tap-lock'

type Props = {
  player: 1 | 2
  detail?: string
  onReady: () => void
}

/**
 * Le seul écran qui existe parce que les deux joueurs partagent un
 * téléphone : il masque intégralement la partie le temps du passage de
 * main. D'où le fond opaque plutôt qu'un voile translucide, et la
 * couverture de toute la fenêtre — un simple panneau laisserait deviner le
 * choix précédent sur les bords.
 *
 * Volontairement **sans animation d'apparition ni de disparition**. Un
 * fondu rendrait la dissimulation tributaire du moteur d'animation : le
 * temps qu'il se joue, l'écran à cacher reste lisible par transparence, et
 * si les images s'interrompent (onglet en arrière-plan, animations
 * désactivées) le voile peut ne jamais devenir opaque. Seule la Pokéball
 * bouge, et son immobilité éventuelle est sans conséquence.
 */
export function PassScreen({ player, detail, onReady }: Props) {
  const reduit = useReducedMotion()

  /*
   * L'écran arrive juste sous la tape qui vient de clore le tour, et il est
   * lui-même une cible plein écran : sans ce court verrou, cette tape le
   * franchirait, et le joueur suivant découvrirait l'arène sans avoir vu
   * qu'on lui passait la main.
   */
  const arme = useTapLock(player)

  return (
    <div className="fixed inset-0 z-50 bg-canvas">
      <button
        type="button"
        onClick={() => arme && onReady()}
        autoFocus
        className="flex size-full flex-col items-center justify-center gap-6 px-6 text-center"
      >
        <motion.span
          animate={reduit ? undefined : { rotate: [0, -12, 12, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        >
          <PokeballIcon className="size-20 text-accent" />
        </motion.span>

        <div className="space-y-2">
          <p className="font-semibold text-ink-faint text-sm uppercase tracking-widest">
            Au tour de
          </p>
          <h2 className="font-black text-4xl text-ink tracking-tight">Joueur {player}</h2>
          {detail && <p className="text-ink-soft">{detail}</p>}
        </div>

        <span className="rounded-full border border-line bg-panel-soft px-5 py-2.5 font-semibold text-ink-soft text-sm">
          Toucher l'écran pour continuer
        </span>

        <p className="max-w-xs text-ink-faint text-xs">
          Ne regarde pas si ce n'est pas ton tour&nbsp;: les deux choix sont simultanés.
        </p>
      </button>
    </div>
  )
}
