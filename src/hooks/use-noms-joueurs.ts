import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { nettoyerNom, nomAffiche } from '@/lib/battle/noms'
import type { Noms } from '@/lib/battle/noms'

const STORAGE_KEY = 'pokedex:joueurs'

function lire(): Noms {
  try {
    const brut = localStorage.getItem(STORAGE_KEY)
    if (!brut) return ['', '']
    const valeur: unknown = JSON.parse(brut)
    if (!Array.isArray(valeur)) return ['', '']
    const [un, deux] = valeur
    return [typeof un === 'string' ? nettoyerNom(un) : '', typeof deux === 'string' ? nettoyerNom(deux) : '']
  } catch {
    // Stockage refusé ou contenu illisible : on repart des défauts.
    return ['', '']
  }
}

let saisis: Noms = lire()
const abonnes = new Set<() => void>()

export function definirNom(side: 0 | 1, valeur: string) {
  const suivant: Noms = side === 0 ? [nettoyerNom(valeur), saisis[1]] : [saisis[0], nettoyerNom(valeur)]
  saisis = suivant

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(suivant))
  } catch {
    // ignore
  }
  for (const abonne of abonnes) abonne()
}

function subscribe(abonne: () => void) {
  abonnes.add(abonne)
  return () => {
    abonnes.delete(abonne)
  }
}

const getSnapshot = () => saisis

/**
 * Les pseudos des deux joueurs, retenus par le téléphone.
 *
 * Même mécanique que le thème et le mode de sprites : un store minuscule
 * hors de React, pour que la saisie faite dans le sélecteur d'équipe soit
 * vue immédiatement par l'arène et l'écran de passage, qui n'en sont pas
 * les enfants.
 *
 * `saisis` est ce qui a été tapé — c'est lui qui alimente le champ, vide
 * compris ; `noms` est ce qui s'affiche, défauts résolus.
 */
export function useNomsJoueurs() {
  const valeur = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  /*
   * Mémorisé, et pas par confort : `noms` entre dans les dépendances de
   * l'effet de rejeu. Un tableau reconstruit à chaque rendu le relancerait
   * en boucle, et le récit repartirait de son étape courante sans fin.
   */
  const noms = useMemo<Noms>(() => [nomAffiche(valeur[0], 0), nomAffiche(valeur[1], 1)], [valeur])
  return { saisis: valeur, noms, definirNom: useCallback(definirNom, []) }
}
