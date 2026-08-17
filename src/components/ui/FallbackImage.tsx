import { useState } from 'react'

type Props = {
  /** De la source préférée à la plus sûre. */
  sources: string[]
  alt?: string
  className?: string
}

/**
 * Descend une chaîne de replis à la première erreur de chargement.
 *
 * Indispensable depuis que les formes alternatives sont jouables : sur les
 * 219 retenues, une n'a pas d'illustration officielle, 41 pas de sprite
 * animé, et une douzaine pas de déclinaison chromatique. Sans repli,
 * l'emplacement afficherait une image cassée.
 *
 * L'étape atteinte se réinitialise quand la source change, sans que
 * l'appelant ait à poser une clé : sinon un Pokémon dont le sprite manquait
 * ferait démarrer le suivant sur son propre repli.
 */
export function FallbackImage({ sources, alt = '', className }: Props) {
  const [repli, setRepli] = useState({ cle: sources[0], etape: 0 })
  const etape = repli.cle === sources[0] ? repli.etape : 0
  const index = Math.min(etape, sources.length - 1)

  return (
    <img
      src={sources[index]}
      alt={alt}
      loading="lazy"
      onError={() => setRepli({ cle: sources[0], etape: etape + 1 })}
      className={className}
    />
  )
}
