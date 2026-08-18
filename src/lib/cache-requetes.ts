/**
 * Ce que le cache de requêtes doit conserver d'un lancement à l'autre.
 *
 * Une donnée téléchargée pour le hors-ligne n'a pas d'observateur : aucun
 * composant ne la lit tant qu'on ne va pas s'en servir. Or, à la relecture
 * du disque, une requête reprend les réglages **du client**, pas ceux qui
 * ont servi à l'écrire. Le `gcTime: Infinity` du téléchargement disparaît
 * donc au rechargement, les cinq minutes par défaut le remplacent, et tout
 * ce qui n'est pas observé est effacé de la mémoire — puis du disque à la
 * sauvegarde suivante.
 *
 * C'est ce qui vidait le mode combat de ses données à chaque rechargement,
 * cinq minutes après l'ouverture, alors que le bouton avait bien annoncé
 * « Dex complet disponible hors ligne » : seules les fiches survivaient,
 * parce qu'elles étaient les seules déclarées ici.
 *
 * Ce que le téléchargement écrit doit donc figurer dans cette liste, et
 * `verify:battle` recoupe chaque clé stockée avec elle.
 */
export const PREFIXES_DURABLES = [
  ['pokedex', 'detail'],
  ['pokedex', 'moves'],
  ['pokedex', 'moveset'],
  ['pokedex', 'formes'],
] as const

/** Vrai si la clé est couverte par l'un des préfixes durables. */
export const estDurable = (cle: readonly unknown[]) =>
  PREFIXES_DURABLES.some((prefixe) => prefixe.every((partie, index) => cle[index] === partie))
