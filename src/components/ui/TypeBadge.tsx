import { typeColor, typeLabel } from '@/lib/pokemon-types'
import type { TypeName } from '@/lib/pokemon-types'

type Size = 'xs' | 'sm' | 'md'

const SIZES: Record<Size, string> = {
  // `xs` sert sur les cartes de la grille : compact pour que deux types
  // tiennent sur une seule ligne, y compris sur les cartes étroites du
  // mobile — sinon le bloc du nom masque la moitié de l'illustration.
  xs: 'px-1.5 py-0.5 text-[9px] tracking-normal',
  sm: 'px-2.5 py-1 text-xs tracking-wide',
  md: 'px-3.5 py-1.5 text-sm tracking-wide',
}

type Props = {
  type: TypeName
  size?: Size
  /**
   * À activer quand la pastille est posée sur le dégradé du type
   * lui-même (carte, en-tête de fiche) : la couleur est alors assombrie
   * pour rester détachée du fond au lieu de s'y fondre.
   */
  onColor?: boolean
  className?: string
}

/**
 * Chaque type a son propre habillage dérivé de sa couleur : dégradé,
 * liseré et halo. Le texte reste blanc avec une ombre portée, sans quoi
 * les types clairs (Électrik, Glace, Acier) deviennent illisibles.
 */
export function TypeBadge({ type, size = 'sm', onColor = false, className = '' }: Props) {
  const color = typeColor(type)

  const style = onColor
    ? {
        background: `linear-gradient(140deg,
          color-mix(in oklab, ${color} 78%, black 22%) 0%,
          color-mix(in oklab, ${color} 58%, black 42%) 100%)`,
        boxShadow: `inset 0 0 0 1.5px color-mix(in oklab, ${color} 45%, white 55%),
          0 4px 14px -6px rgb(0 0 0 / 0.6)`,
      }
    : {
        background: `linear-gradient(140deg,
          color-mix(in oklab, ${color} 84%, white 16%) 0%,
          color-mix(in oklab, ${color} 94%, black 6%) 100%)`,
        boxShadow: `inset 0 1px 0 color-mix(in oklab, white 38%, transparent),
          0 4px 12px -5px color-mix(in oklab, ${color} 85%, transparent)`,
      }

  return (
    <span
      className={`inline-flex items-center rounded-full font-bold uppercase ${SIZES[size]} ${className}`}
      style={{ ...style, color: 'white', textShadow: '0 1px 2px rgb(0 0 0 / 0.42)' }}
    >
      {typeLabel(type)}
    </span>
  )
}
