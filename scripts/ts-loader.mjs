/*
 * Permet à Node d'exécuter les sources du projet sans passer par Vite.
 *
 * Deux choses lui manquent nativement : l'alias `@/` défini dans
 * `tsconfig.json`, et l'extension `.ts` que TypeScript autorise à omettre
 * alors que les modules ES l'exigent.
 *
 * Utilisé uniquement par `npm run verify:battle`.
 */
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SRC = pathToFileURL(new URL('../src/', import.meta.url).pathname).href

export function resolve(specifier, context, next) {
  let cible = specifier

  if (cible.startsWith('@/')) cible = SRC + cible.slice(2)

  const relatif = cible.startsWith('./') || cible.startsWith('../')
  if ((relatif || cible.startsWith('file:')) && !/\.[cm]?[jt]sx?$/.test(cible)) {
    const base = relatif ? new URL(cible, context.parentURL).href : cible
    for (const ext of ['.ts', '.tsx', '.js']) {
      if (existsSync(fileURLToPath(base + ext))) return next(base + ext, context)
    }
  }

  return next(cible, context)
}
