import { useEffect, useId, useRef, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { MenuIcon } from '@/components/ui/icons'
import { useProgressionHorsLigne } from '@/hooks/use-offline-download'

/**
 * Une ligne du menu : la commande telle qu'elle existe déjà, avec son nom
 * à côté.
 *
 * Les contrôles ne sont pas redessinés pour l'occasion — ce sont les mêmes
 * composants qu'en rangée, simplement posés à plat. Deux rendus d'un même
 * bouton dériveraient, et l'un des deux finirait par mentir sur son état.
 */
export function LigneMenu({ label, children }: { label: string; children: ReactNode }) {
  /*
   * Toute la ligne est une cible, pas seulement la pastille : dans un menu
   * on vise le mot, et une rondelle de 36 px au bout du doigt est le genre
   * de détail qui fait rater une tape sur deux. Le clic est renvoyé au
   * bouton qu'elle contient — sauf s'il l'a déjà reçu lui-même, sans quoi
   * le réglage basculerait deux fois et reviendrait à son point de départ.
   */
  const relayer = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return
    event.currentTarget.querySelector('button')?.click()
  }

  return (
    <div
      onClick={relayer}
      className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 transition hover:bg-panel-soft"
    >
      {children}
      <span className="font-semibold text-ink-soft text-sm">{label}</span>
    </div>
  )
}

/**
 * Le tiroir des réglages, sur les écrans trop étroits pour les aligner.
 *
 * Il ne contient que ce qu'on règle une fois : thème, style des sprites,
 * téléchargement hors ligne. Ce qu'on utilise en jouant — la recherche, les
 * favoris, le combat — reste dehors : un menu qu'il faut ouvrir pour chaque
 * action coûte une tape à chaque fois.
 */
export function HeaderMenu({ children }: { children: ReactNode }) {
  const [ouvert, setOuvert] = useState(false)
  /*
   * Le téléchargement se lance depuis ce menu et dure plusieurs minutes.
   * Replié, il ne laisserait aucun signe extérieur : la commande porte donc
   * l'avancement tant qu'il tourne.
   */
  const { enCours, pourcentage } = useProgressionHorsLigne()
  const zone = useRef<HTMLDivElement>(null)
  const reduit = useReducedMotion()
  const id = useId()

  useEffect(() => {
    if (!ouvert) return

    const dehors = (event: PointerEvent) => {
      if (!zone.current?.contains(event.target as Node)) setOuvert(false)
    }
    const echap = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOuvert(false)
    }

    // `pointerdown` et non `click` : sans quoi la tape qui ouvre le menu le
    // refermerait aussitôt en remontant jusqu'au document.
    document.addEventListener('pointerdown', dehors)
    document.addEventListener('keydown', echap)
    return () => {
      document.removeEventListener('pointerdown', dehors)
      document.removeEventListener('keydown', echap)
    }
  }, [ouvert])

  return (
    <div ref={zone} className="relative">
      <button
        type="button"
        onClick={() => setOuvert((valeur) => !valeur)}
        aria-expanded={ouvert}
        aria-controls={id}
        aria-label={enCours ? `Réglages — téléchargement ${pourcentage} %` : 'Réglages'}
        className={`flex h-9 items-center justify-center gap-1 rounded-full border transition ${
          enCours ? 'px-2.5' : 'w-9'
        } ${
          ouvert || enCours
            ? 'border-transparent bg-accent text-white'
            : 'border-line bg-panel-soft text-ink-soft hover:text-ink'
        }`}
      >
        <MenuIcon className={`size-4.5 shrink-0 ${enCours ? 'animate-pulse' : ''}`} />
        {enCours && (
          <span className="font-semibold text-xs tabular-nums" aria-hidden="true">
            {pourcentage} %
          </span>
        )}
      </button>

      {/*
        Le glissement est animé, jamais l'opacité — même règle que l'écran
        de passage. Un panneau qui masque du contenu doit être opaque dès la
        première image : si les images se raréfient (onglet en
        arrière-plan, `requestAnimationFrame` suspendu), un fondu d'entrée
        reste figé à mi-course et le menu se lit par transparence. Six
        pixels de décalage figés, eux, ne gênent rien.
      */}
      {ouvert && (
        <motion.div
          id={id}
          initial={reduit ? false : { y: -6 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.14, ease: 'easeOut' }}
          className="absolute right-0 z-50 mt-2 min-w-52 rounded-2xl border border-line bg-panel-soft p-1 shadow-lg shadow-black/30"
        >
          {children}
        </motion.div>
      )}
    </div>
  )
}
