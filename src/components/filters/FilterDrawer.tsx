import { useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CloseIcon } from '@/components/ui/icons'
import { useScrollLock } from '@/hooks/use-scroll-lock'

type Props = {
  open: boolean
  onClose: () => void
  children: React.ReactNode
}

/** Panneau de filtres en tiroir, uniquement sous le point de rupture `lg`. */
export function FilterDrawer({ open, onClose, children }: Props) {
  useScrollLock(open)

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)

    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div className="lg:hidden">
          <motion.div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-label="Filtres"
            aria-modal="true"
            className="stable-gutter fixed inset-y-0 right-0 z-50 w-[90vw] max-w-sm overflow-y-auto bg-canvas p-3"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
          >
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                aria-label="Fermer les filtres"
                className="grid size-9 place-items-center rounded-full bg-panel text-ink-soft transition hover:text-ink"
              >
                <CloseIcon className="size-4.5" />
              </button>
            </div>
            {children}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  )
}
