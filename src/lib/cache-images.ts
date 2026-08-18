import { NOM_CACHE_SPRITES } from '@/lib/cache-sprites'

/**
 * Réparation d'une image que le cache sert cassée.
 *
 * Une réponse opaque — celle de toute balise `<img>` — ne porte pas de
 * statut : le service worker range de la même façon un PNG et le 429 que le
 * CDN renvoie quand on le sollicite trop vite. Une image refusée peut donc
 * dormir un an dans le cache, et se redemander ne sert à rien puisque le
 * cache répond en premier. Rien ne permet de la distinguer d'avance : ni sa
 * taille, ni ses en-têtes, ni son corps, tous masqués par l'opacité.
 *
 * Le seul juge est donc l'affichage lui-même. Quand une image échoue, on
 * retire l'entrée du cache et on va la rechercher **en CORS**, où le statut
 * est lisible : si elle revient, l'appelant réaffiche, et l'entrée est cette
 * fois saine. C'est ce qui remet en état les vignettes tombées pendant un
 * téléchargement, sans redemander les cinq mille autres.
 */

/**
 * Une seule tentative par URL et par session : sans cela, une image
 * réellement absente du CDN — ou un appareil hors ligne — enchaînerait
 * suppression, échec et nouvelle suppression sans fin.
 */
const tentees = new Set<string>()

/** Vrai si l'image a été retirée du cache **et** récupérée à nouveau. */
export async function reparerImage(url: string): Promise<boolean> {
  if (tentees.has(url) || !('caches' in window)) return false
  tentees.add(url)

  try {
    const cache = await caches.open(NOM_CACHE_SPRITES)
    /*
     * `ignoreVary` : la requête construite ici n'a pas les en-têtes qu'une
     * balise `<img>` envoie, et le CDN fait varier ses réponses dessus.
     */
    const supprimee = await cache.delete(url, { ignoreVary: true })
    // Rien en cache : l'image manque vraiment, et l'appelant doit se replier
    // plutôt que d'attendre une réparation qui n'a pas lieu d'être.
    if (!supprimee) return false

    const reponse = await fetch(url, { mode: 'cors' })
    return reponse.ok
  } catch {
    return false
  }
}
