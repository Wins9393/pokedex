# Pokédex

Pokédex complet des 1025 espèces, en français, construit avec React 19, TypeScript et
[PokéAPI](https://pokeapi.co).

```bash
npm install
npm run dev
```

## Ce que fait l'application

- **Les 1025 espèces** dans une grille virtualisée — pas de pagination, le défilement est fluide
  parce que seules les lignes visibles sont montées.
- **Recherche tolérante** : le nom français, le nom anglais et le numéro fonctionnent, sans
  sensibilité aux accents, avec correspondance approximative (`drcf` → Dracaufeu). Les résultats
  sont classés par pertinence.
- **Filtres combinables** : types (mode OU / ET), générations, catégories (légendaire, fabuleux,
  bébé), plages sur chaque statistique, sur le total, sur la taille et le poids, favoris
  uniquement. Tri sur n'importe quel critère.
- **État dans l'URL** : toute vue filtrée est partageable et survit à un rechargement.
- **Fiche détaillée** : descriptions du Pokédex par version, talents (dont le talent caché),
  fiche d'identité, statistiques en barres et en radar, faiblesses calculées, chaîne d'évolution
  avec ses conditions, formes alternatives, forme chromatique et cri.
- **Sprites animés par défaut**, dans la grille comme sur la fiche, avec un interrupteur dans
  l'en-tête pour revenir aux illustrations officielles (choix mémorisé). En mode illustration, le
  survol d'une carte donne un aperçu animé.
- **Favoris** persistés en local, thème clair/sombre, navigation clavier (`/`, `←`, `→`, `Échap`).

## Choix techniques

### Une seule requête réseau

L'API REST de PokéAPI demanderait environ 1300 appels pour construire l'index. La couche GraphQL
renvoie la même chose en **une requête de 620 Ko** (62 Ko compressés, ~1 s) :

```
graphql.pokeapi.co/v1beta2  →  1025 espèces + la matrice d'efficacité des 18 types
```

Conséquence directe : la recherche et les filtres s'exécutent en mémoire et ne dépendent jamais du
réseau. L'index est mis en cache dans `localStorage` (424 Ko), ce qui rend l'application
**utilisable hors ligne** dès la deuxième visite — au rechargement, aucune requête n'est émise.

Les fiches détaillées sont chargées à la demande et volontairement **exclues** de la persistance,
pour ne pas saturer le quota de stockage.

### Pièges rencontrés

Quelques points qui ne se devinent pas et sont documentés dans le code :

- **Les identifiants de type de PokéAPI ne suivent pas l'ordre d'affichage** (Combat = 2, Feu = 10).
  Les déduire d'une position dans une liste fausse silencieusement toute la table des faiblesses.
  Voir `TYPE_BY_ID` dans [`src/lib/pokemon-types.ts`](src/lib/pokemon-types.ts).
- **L'index est construit à partir des espèces, pas des Pokémon** : interroger `pokemon` renvoie
  1026 entrées par défaut, Ursaking Lune Vermeille apparaissant en double.
- **127 espèces (Hisui et 9ᵉ génération) n'ont pas de description française.** La requête demande
  donc les deux langues et l'interface signale explicitement le repli sur l'anglais.
- **Tailwind v4 élimine les variables de thème non référencées littéralement dans les sources.**
  Les couleurs de type étant construites dynamiquement, elles sont déclarées dans un bloc
  `@theme static`.
- **Les formes alternatives ont leurs propres types et statistiques** : Méga-Dracaufeu X passe en
  Feu/Dragon, ce qui change les faiblesses affichées.
- **Les sprites animés (jeu « Showdown ») ne couvrent pas tout le dex** : une poignée de Pokémon
  très récents n'en ont pas. La disponibilité est lue dans les données de l'API pour la fiche, et
  gérée par un repli sur l'illustration en cas d'erreur de chargement dans la grille.
- **Animer la grille coûte moins cher que ne pas l'animer.** Un GIF animé pèse 64 Ko en moyenne
  contre 133 Ko pour une illustration officielle. Comme la grille est virtualisée, seule une
  trentaine de sprites est chargée à la fois. En revanche, il ne faut monter **qu'une seule** des
  deux images : les afficher toutes deux, ne serait-ce qu'en réserve invisible, doublerait le
  trafic. Précharger le dex entier représenterait 64 Mo, et le CDN ne renvoie qu'un
  `cache-control: max-age=300` — un cache durable exigerait un service worker.
- **Tout dépend du type de barre de défilement du système**, et les deux cas demandent des
  traitements opposés :
  - *Barres classiques* (elles occupent de la largeur) : une zone en `overflow: auto` décale son
    contenu dès que sa barre apparaît ou disparaît, ce qui arrive quand une fiche courte succède
    à une fiche longue. D'où la gouttière réservée (`stable-gutter`) sur la fiche, le panneau de
    filtres et le tiroir, et la compensation par padding de `use-scroll-lock` quand une surcouche
    verrouille le défilement de la page.
  - *Barres en surimpression* (macOS et Firefox par défaut) : elles flottent au-dessus du contenu
    et ne décalent rien. Y réserver une gouttière ne ferait que creuser un vide permanent.

  `lib/scrollbars.ts` mesure le comportement réel au démarrage et marque la page en conséquence ;
  toutes les gouttières sont conditionnées à ce marqueur. La compensation de `use-scroll-lock`
  s'annule d'elle-même, la largeur mesurée valant alors zéro.
- **Le port de développement est fixé à 5180**, et non au 5173 par défaut : d'autres projets du
  dossier y enregistrent un service worker qui survit à l'arrêt de leur serveur et parasite
  ensuite toute application servie sur cette origine.

### Structure

```
src/
├── api/        client GraphQL, requêtes, normalisation des réponses
├── lib/        recherche, filtres, table des types, sprites, formatage
├── hooks/      index, fiche, filtres (URL), favoris, thème, cri, inclinaison 3D
├── components/ layout · grid · filters · detail · ui
└── pages/      PokedexPage
```

`src/api/normalize.ts` est le seul fichier qui connaît la forme brute de l'API : il aplatit les
réponses GraphQL en modèles simples utilisés partout ailleurs.

## Scripts

| Commande | Effet |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run build` | Vérification des types puis build de production |
| `npm run preview` | Sert le build de production |
| `npm run lint` | oxlint |

## Crédits

Données et illustrations : [PokéAPI](https://pokeapi.co) · Pokémon est une marque de Nintendo,
Game Freak et The Pokémon Company. Projet non officiel, à but éducatif.
