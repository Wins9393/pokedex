/**
 * Distingue les barres de défilement classiques, qui occupent de la
 * largeur dans la mise en page, des barres en surimpression (macOS et
 * Firefox par défaut), qui flottent au-dessus du contenu et s'effacent
 * quand on ne défile pas.
 *
 * Cette distinction conditionne tout le traitement des décalages : avec
 * des barres en surimpression il n'y a rien à compenser, et réserver une
 * gouttière n'y creuserait qu'un vide permanent.
 *
 * La mesure demande un `<body>` déjà en place : une sonde rattachée à
 * `<html>` avant lui n'est pas mise en page et renvoie toujours 0.
 */
export function markScrollbarKind() {
  const probe = document.createElement('div')
  probe.style.cssText = 'position:absolute;top:-9999px;width:100px;height:100px;overflow:scroll'
  document.body.appendChild(probe)

  const takesSpace = probe.offsetWidth - probe.clientWidth > 0
  probe.remove()

  document.documentElement.classList.toggle('classic-scrollbars', takesSpace)
  return takesSpace
}
