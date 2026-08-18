import { useCallback, useState } from 'react'
import { reparerImage } from '@/lib/cache-images'

/**
 * Donne à une image une seconde chance avant de se replier.
 *
 * `cle` sert de `key` à la balise : la changer démonte l'image et relance sa
 * requête, ce qui est le seul moyen sûr de refaire partir un chargement qui
 * a échoué. Elle ne bouge que si la réparation a réellement rapporté le
 * fichier ; sinon `sinon()` est appelé et la chaîne de replis reprend son
 * cours, sans que l'appelant ait à savoir qu'un cache existe.
 */
export function useReparationImage() {
  const [cle, setCle] = useState(0)

  const reparer = useCallback((url: string, sinon: () => void) => {
    void reparerImage(url).then((reparee) => {
      if (reparee) setCle((valeur) => valeur + 1)
      else sinon()
    })
  }, [])

  return { cle, reparer }
}
