/** Icônes inline : pas de dépendance, pas de requête, taille contrôlée par `currentColor`. */

type IconProps = { className?: string }

const base = 'shrink-0'

export const HeartIcon = ({ className = '', filled = false }: IconProps & { filled?: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className={`${base} ${className}`}
    fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 20.5S3.5 15 3.5 9.2A4.7 4.7 0 0 1 12 6.6a4.7 4.7 0 0 1 8.5 2.6C20.5 15 12 20.5 12 20.5Z" />
  </svg>
)

export const SearchIcon = ({ className = '' }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className={`${base} ${className}`}
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
  >
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.6-3.6" />
  </svg>
)

export const CloseIcon = ({ className = '' }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className={`${base} ${className}`}
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
  >
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
)

export const SunIcon = ({ className = '' }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className={`${base} ${className}`}
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
  >
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
  </svg>
)

export const MoonIcon = ({ className = '' }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className={`${base} ${className}`}
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2Z" />
  </svg>
)

export const SparklesIcon = ({ className = '' }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className={`${base} ${className}`}
    fill="currentColor"
  >
    <path d="M12 2.5l1.7 4.9 4.9 1.7-4.9 1.7L12 15.7l-1.7-4.9-4.9-1.7 4.9-1.7L12 2.5Z" />
    <path d="M19 14.5l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.6Z" opacity=".75" />
    <path d="M5 13l.7 2 2 .7-2 .7L5 18.4l-.7-2-2-.7 2-.7L5 13Z" opacity=".55" />
  </svg>
)

export const VolumeIcon = ({ className = '' }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className={`${base} ${className}`}
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M11 5 6.5 8.8H3.5v6.4h3L11 19V5Z" />
    <path d="M15.2 9.2a4 4 0 0 1 0 5.6M18 6.4a8 8 0 0 1 0 11.2" />
  </svg>
)

export const SlidersIcon = ({ className = '' }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className={`${base} ${className}`}
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
  >
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2.2" />
    <circle cx="10" cy="17" r="2.2" />
  </svg>
)

export const ArrowLeftIcon = ({ className = '' }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className={`${base} ${className}`}
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M15 5l-7 7 7 7" />
  </svg>
)

export const ChevronDownIcon = ({ className = '' }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className={`${base} ${className}`}
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
)

/** Petit sprite en pixels : symbolise le mode « sprites animés du jeu ». */
export const PixelSpriteIcon = ({ className = '' }: IconProps) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={`${base} ${className}`} fill="currentColor">
    <path d="M7 3h4v2H7zM13 3h4v2h-4zM5 5h2v4H5zM17 5h2v4h-2zM8 8h2v2H8zM14 8h2v2h-2zM5 11h14v2H5zM7 15h10v2H7zM5 19h4v2H5zM15 19h4v2h-4z" />
  </svg>
)

export const DownloadIcon = ({ className = '' }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className={`${base} ${className}`}
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 3.5v11" />
    <path d="m7.5 10 4.5 4.5 4.5-4.5" />
    <path d="M4.5 19.5h15" />
  </svg>
)

export const CheckIcon = ({ className = '' }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className={`${base} ${className}`}
    fill="none"
    stroke="currentColor"
    strokeWidth={2.5}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="m4.5 12.5 5 5 10-11" />
  </svg>
)

export const SwordsIcon = ({ className = '' }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className={`${base} ${className}`}
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14.5 14.5 20 20M20 4l-8.5 8.5M4 4l8.5 8.5M9.5 14.5 4 20" />
    <path d="M17.5 4H20v2.5M6.5 4H4v2.5M17.5 20H20v-2.5M6.5 20H4v-2.5" />
  </svg>
)

export const SwapIcon = ({ className = '' }: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className={`${base} ${className}`}
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5" />
  </svg>
)

export const PokeballIcon = ({ className = '' }: IconProps) => (
  <svg viewBox="0 0 100 100" aria-hidden="true" className={`${base} ${className}`}>
    <circle cx="50" cy="50" r="45" fill="currentColor" opacity=".18" />
    <path d="M5 50a45 45 0 0 1 90 0Z" fill="currentColor" opacity=".55" />
    <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="6" />
    <path d="M5 50h90" stroke="currentColor" strokeWidth="6" />
    <circle cx="50" cy="50" r="14" fill="var(--panel, #fff)" stroke="currentColor" strokeWidth="6" />
  </svg>
)
