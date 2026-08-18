/**
 * Dimensionnement du cache d'images du service worker.
 *
 * Partagé entre `vite.config.ts`, qui le passe à Workbox, et
 * `verify:battle`, qui vérifie qu'il couvre toujours ce que le
 * téléchargement hors ligne demande. Un fichier sans dépendance, pour
 * pouvoir être importé des deux côtés.
 */

/**
 * Plafond du cache, **en nombre de fichiers**.
 *
 * C'est l'unité que compte `ExpirationPlugin`, et c'est là qu'était
 * l'erreur : la valeur précédente — 2500 — avait été choisie sur un
 * raisonnement en mégaoctets (« 164 Mo, 3 % d'un quota typique »), juste
 * sur le volume et sans rapport avec ce que le plafond mesure. Elle datait
 * de la simple navigation, deux images par espèce, soit 2050 fichiers.
 *
 * Le téléchargement hors ligne en réclame aujourd'hui 4976 — quatre par
 * combattant, formes comprises. Au-delà du plafond, Workbox évince la plus
 * ancienne entrée à chaque écriture : le téléchargement se mangeait donc
 * lui-même en cours de route, et la moitié du dex repartait chercher ses
 * images au CDN, qui répond 429.
 *
 * La marge couvre ce que la navigation ajoute par-dessus le préchargement :
 * chromatiques consultés sur les fiches, dos animés vus en combat. Le vrai
 * garde-fou contre un appareil à l'espace contraint reste
 * `purgeOnQuotaError`, pas ce nombre.
 */
export const PLAFOND_SPRITES = 6000

/**
 * Durée de vie d'une image en cache.
 *
 * Un an, et non trente jours comme auparavant : une application dont
 * l'argument est le hors-ligne ne peut pas laisser ses images expirer au
 * bout d'un mois pour retourner les chercher sur un CDN qu'on peut être
 * hors d'état d'atteindre.
 */
export const DUREE_SPRITES = 60 * 60 * 24 * 365

/**
 * Nom du cache d'images du service worker.
 *
 * Déclaré ici parce que trois codes le désignent : la règle Workbox qui
 * l'alimente, le téléchargement hors ligne qui recense ce qu'il contient, et
 * la réparation qui en retire les entrées cassées. Une chaîne recopiée trois
 * fois, c'est trois occasions d'écrire dans un cache que personne ne lit.
 */
export const NOM_CACHE_SPRITES = 'pokemon-sprites'
