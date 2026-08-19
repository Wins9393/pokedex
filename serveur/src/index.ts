import { Salle } from './salle'
import { LONGUEUR_CODE } from '../../src/lib/battle/protocole'

export { Salle }

type Env = { SALLES: DurableObjectNamespace<Salle> }

/**
 * L'entrée de l'arbitre : une seule route, `/{CODE}`, qui aiguille vers
 * l'objet durable du même nom.
 *
 * Rien d'autre à faire ici. Pas de session à tenir, pas de table de salles
 * à gérer : le code **est** l'identifiant de l'objet, et la plateforme se
 * charge de n'en garder qu'une instance vivante. Une salle qui n'existe pas
 * encore existe dès qu'on la nomme.
 */
export default {
  async fetch(requete: Request, env: Env): Promise<Response> {
    const url = new URL(requete.url)

    if (url.pathname === '/' || url.pathname === '/sante') {
      return new Response('arbitre pokédex', { status: 200 })
    }

    const code = url.pathname.slice(1).toUpperCase()
    if (code.length !== LONGUEUR_CODE || !/^[A-Z0-9]+$/.test(code)) {
      return new Response('Code de salle invalide.', { status: 404 })
    }

    /*
     * `idFromName` dérive un identifiant stable du code : les deux
     * téléphones tombent sur le même objet sans qu'aucun registre
     * n'existe. Aucune authentification en amont — le code à quatre
     * lettres est le secret, comme un code de partie de salon.
     */
    return env.SALLES.get(env.SALLES.idFromName(code)).fetch(requete)
  },
}
