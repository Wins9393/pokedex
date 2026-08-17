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
- **Installable** : application web progressive, lancée en fenêtre autonome depuis l'écran
  d'accueil, avec sa propre icône et un fonctionnement hors ligne.
- **Téléchargement intégral** : un bouton précharge les 1025 fiches et leurs images pour un usage
  hors ligne complet, avec progression et annulation. Il se grise dès que tout est déjà en cache,
  et une reprise après interruption ne retélécharge que ce qui manque.
- **Mode combat à deux sur un seul téléphone** : chaque joueur compose une équipe de trois, puis les
  deux choisissent leur action derrière un écran de passage avant que le tour ne se résolve. Chaque
  attaque annonce son efficacité contre le Pokémon en face.
- **Formes et chromatiques au combat** : 219 formes jouables — Méga, Primo, régionales, Motisma,
  Deoxys — avec leurs propres types et statistiques, et la variante chromatique pour n'importe quel
  Pokémon.

## Choix techniques

### Une seule requête réseau

L'API REST de PokéAPI demanderait environ 1300 appels pour construire l'index. La couche GraphQL
renvoie la même chose en **une requête de 620 Ko** (62 Ko compressés, ~1 s) :

```
graphql.pokeapi.co/v1beta2  →  1025 espèces + la matrice d'efficacité des 18 types
```

Conséquence directe : la recherche et les filtres s'exécutent en mémoire et ne dépendent jamais du
réseau. L'index est persisté dans **IndexedDB** (424 Ko), ce qui rend l'application **utilisable
hors ligne** dès la deuxième visite — au rechargement, aucune requête n'est émise.

Les fiches détaillées sont chargées à la demande, puis persistées elles aussi : un Pokémon consulté
une fois le reste hors ligne, définitivement. Une fiche pèse une trentaine de kilooctets une fois
normalisée, contre 40 Ko en moyenne dans la réponse brute — les 1025 tiendraient dans une dizaine
de mégaoctets.

### Le mode combat

Deux joueurs, un téléphone. Équipes de trois, changement possible au prix du tour, et des choix
**simultanés** : chacun décide derrière un écran de passage, puis la Vitesse arbitre l'ordre — comme
dans les jeux, où l'on ne sait pas ce que l'adversaire a choisi.

Le moteur est **une fonction pure, sans React** (`src/lib/battle/`). Il ne renvoie pas seulement
l'état d'arrivée mais **le récit du tour** sous forme d'événements, que l'interface rejoue un par un.
C'est ce qui donne gratuitement le journal de combat et le rythme des animations — et ce qui
permettra, le jour venu, de faire jouer deux téléphones en n'échangeant que les deux actions.

L'aléatoire passe par un générateur à graine. Sans lui le moteur serait intestable, et deux
`Math.random()` indépendants feraient diverger deux écrans dès le deuxième tour.

**Le récit avance à la tape, pas au chronomètre**, comme dans les jeux. Le tour se résolvait en
quatre secondes environ, ce qui suffit à lire chaque ligne *si on l'attendait* — or le joueur 2
vient de choisir son attaque et découvre la réponse.

Une tape par événement, y compris pour les dégâts, qui n'ont pas de phrase : la jauge qui se vide
est le paiement de l'attaque annoncée juste avant, elle doit se déclencher et non survenir. Mesuré
sur 370 tours simulés : **4,7 tapes par tour** en moyenne, huit au pire.

La sélection d'équipe réutilise tout l'appareillage de filtres de la grille — panneau, tiroir, chips,
tri — à une différence près : ses filtres sont **locaux au lieu de vivre dans l'URL**, sans quoi ceux
du joueur 1 se transmettraient au joueur 2, qui ouvrirait une liste déjà restreinte sans savoir
pourquoi. Les composants ne connaissant que l'interface `FiltersController`, il a suffi d'une seconde
implémentation adossée à `useState` (`useLocalFilters`).

**Ce qui est simulé** : dégâts, table des types, STAB, coups critiques, PP, précision, priorité.
**Ce qui ne l'est pas** : statuts et changements de statistiques. Conséquence assumée, à connaître —
Lance-Flammes inflige ses dégâts mais ne brûle jamais. Écarter toutes les attaques à effet
secondaire aurait vidé le jeu de ses classiques.

En revanche, le vivier écarte les attaques qu'ignorer leur contrepartie rendrait abusives, sur des
critères lus dans les données et non sur une liste de noms à maintenir : contrecoup (`drain < 0`),
coups multiples (`min_hits`), deux tours (`move_effect_id`, liste dérivée des textes d'effet de
l'API), puissance supérieure à 120, et la catégorie `unique`. Il reste **394 attaques**, et chacun
des 18 types en compte au moins quatre.

Le calcul étant invisible à l'œil nu — un arrondi de travers ne se voit que dans des chiffres
légèrement faux —, il est vérifié hors interface sur des valeurs calculées à la main :

```bash
npm run verify:battle
```

#### Formes et chromatiques

Une forme n'est qu'une **autre source de types, de statistiques et de sprites** : le moteur ignore
qu'elle existe. Elle se choisit après le Pokémon, sur l'emplacement d'équipe lui-même — verser les
219 formes dans la liste ferait défiler trois Dracaufeu de suite pour un choix qui ne concerne que
179 des 1025 espèces.

PokéAPI expose 326 Pokémon non-défaut, ramenés à **219 sur 179 espèces** par trois règles lues dans
les données plutôt que dans une liste de noms :

| Écarté | Repéré par | Volume |
| --- | --- | --- |
| Purement décoratif | mêmes types **et** mêmes statistiques que l'espèce | 92 — dont 33 Gigamax, 10 Alpha, les Pikachu déguisés |
| Fratrie identique | empreinte déjà vue chez la même espèce | les 7 noyaux de Minior → 1 |
| Hors barème | total supérieur à 800 | 1 — Éthernatos Infinimax et ses 1125 |

Le tout tient en **une requête de 159 Ko** (13 Ko compressés). Les Méga plafonnent ensuite à 780,
contre 720 pour Arceus déjà présent au dex.

Le chromatique, lui, ne coûte **rien du tout** : là où le sprite normal existe, le chromatique
existe aussi — vérifié sans exception sur les 1025 espèces (1004 sprites Showdown de dos, 1004 en
chromatique) comme sur les formes (264 et 264). C'est un booléen et un segment d'URL.

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
- **Face et dos vont toujours par paire, mais un Pokémon peut n'avoir aucun sprite de jeu.** Sur les
  1244 combattants — 219 formes jouables et 1025 espèces — pas un seul cas de « face présente, dos
  absent » à l'intérieur d'une même famille d'images. En revanche **un** combattant n'a ni sprite
  animé ni sprite pixel, d'aucun côté : Méga-Zygarde, forme de Legends Z-A dont PokéAPI ne connaît
  que les rendus récents.
- **Dans l'emplacement du joueur, la pose prime sur la forme.** Pour ce cas unique, deux replis
  imparfaits s'opposaient : le dos de l'espèce (bonne pose, animé, mais la forme de base) ou le
  rendu de face de la forme (bonne forme, mauvais angle). C'est le dos de l'espèce qui l'emporte —
  un Pokémon de face au premier plan casse la lecture de la scène, on ne sait plus quel camp on
  regarde, alors qu'une silhouette de base reste un dos crédible sous un encadré qui nomme la bonne
  forme. Méga-Zygarde affiche donc `showdown/back/718.gif`. L'emplacement adverse, lui, ne se rabat
  pas sur l'espèce : un rendu de face y est déjà la bonne pose, autant garder la bonne forme.
  L'arbitrage n'existe que côté joueur.
- **L'illustration et le rendu HOME restent le dernier recours absolu**, pour le jour où une espèce
  n'aurait pas non plus de sprite de dos — aucune aujourd'hui. Leur réunion couvre les 1244 sans
  exception (1243 et 1242 pris séparément), ce qui garantit qu'aucun combattant ne finit sur un
  cadre vide. `verify:battle` contrôle les deux propriétés et avertira si PokéAPI ajoute d'autres
  formes sans sprites.
- **Une chaîne de replis doit descendre par paliers symétriques.** La vue de face sautait le sprite
  pixel pour aller directement à l'illustration : les 61 combattants sans sprite animé
  apparaissaient donc en pixel art dans le camp du joueur et en illustration lissée dans celui d'en
  face — le même Pokémon n'avait pas le même rendu selon le côté du terrain. Hors ligne, les deux
  camps retombent ensemble sur l'illustration, seule image préchargée : la symétrie tient aussi.
- **`sprites(path: "…")` projette dans le JSON côté serveur.** Vérifier la disponibilité des images
  des 1244 combattants demandait dix mégaoctets de blobs ; en ne demandant que les quatre chemins
  utiles, la même vérification tient en ~300 Ko.
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
  ensuite toute application servie sur cette origine. Pour la même raison, le service worker de
  ce projet est **désactivé en développement** : il n'existe que dans le build de production.
- **Une requête GraphQL part en POST, et l'API Cache ne sait stocker que des GET.** Le service
  worker ne peut donc rien faire pour les données : le hors-ligne des données repose entièrement
  sur la persistance IndexedDB de TanStack Query. Le service worker ne prend en charge que la
  coquille applicative et les médias, qui eux passent bien en GET.
- **Trois stockages coexistent, avec des quotas sans rapport entre eux.** `localStorage` plafonne
  à ~5 Mo et n'accepte que des chaînes ; IndexedDB et l'API Cache partagent le quota d'origine,
  qui se compte en gigaoctets. C'est ce qui a fait passer la persistance de l'un à l'autre :
  l'index seul tenait dans 5 Mo, les fiches non.
- **PokéAPI limite le débit sans le dire.** Passé environ deux cents requêtes rapprochées, ses
  réponses perdent l'en-tête `Access-Control-Allow-Origin` et échouent donc toutes d'un coup, sans
  jamais renvoyer de `429`.
- **Contre cette limite, ralentir ne suffit pas : il faut demander moins souvent.** Le
  téléchargement intégral émettait une requête par Pokémon, soit plus d'un millier, et se faisait
  couper autour de la deux centième — il plafonnait à 10 %. Toutes les requêtes d'API partent
  désormais par lots : 52 pour les fiches (vingt à la fois), 22 pour les capacités (soixante,
  espèces et formes confondues), une pour la table d'attaques et une pour celle des formes.
  **76 requêtes au lieu de 1044**, et le dex entier arrive en une vingtaine de secondes. La cadence
  auto-ajustée reste, mais comme filet plutôt que comme parade.
- **La table des formes se récupère avant la planification, pas pendant.** C'est elle qui dit
  quelles capacités et quelles images restent à chercher : la compter comme une tâche parmi les
  autres obligerait à publier un total qui changerait en cours de route, sous les yeux de
  l'utilisateur. Son échec n'arrête rien — le reste se télécharge et les combats restent jouables
  hors ligne avec les seules formes par défaut.
- **Toutes les images de formes n'existent pas**, et l'état « complet » ne peut donc pas en
  dépendre : sur les 219 formes jouables, une n'a aucune illustration officielle et 41 pas de
  sprite animé. Elles se téléchargent quand même, mais seul le compte des illustrations d'espèces —
  1025 sur 1025 — décide de la complétude. Le chromatique, lui, n'est **pas** préchargé : ce serait
  doubler le volume pour du décoratif, et l'arène retombe d'elle-même sur les couleurs normales.
- **Un mode ajouté après le téléchargement hors ligne n'hérite pas de ses images.** Le
  préchargement datait d'avant le mode combat et ne connaissait que l'illustration et le sprite
  animé de face. En mode avion, la chaîne de dos échouait donc à chaque palier et retombait sur
  l'illustration : les 1244 combattants s'affichaient de face dans l'emplacement du joueur. Les
  sprites pixel, de face et de dos, sont désormais préchargés eux aussi.
- **C'est la version pixel qui est préchargée, pas l'animée.** Mesuré : un dos animé pèse 79 Ko,
  un dos pixel 1,1 Ko. Les 1244 dos animés représenteraient **93 Mo**, soit 37 % de plus sur un
  téléchargement qui pèse déjà 250 Mo d'images ; les dos pixel tiennent dans **un mégaoctet**, à
  0,4 %. Hors ligne, le Pokémon du joueur est donc net et immobile plutôt qu'animé — mais il est vu
  du bon côté, ce qui est le point.
- **Un blocage d'API ne doit pas emporter les images.** Elles viennent d'un CDN qui n'a rien à voir
  avec PokéAPI : le blocage est donc propre à chaque phase, et les sprites se téléchargent même si
  l'API vient de couper.
- **Une fiche écrite avec `setQueryData` n'est observée par personne**, donc soumise au `gcTime`
  par défaut : elle disparaîtrait cinq minutes plus tard, avant la prochaine écriture sur disque.
  D'où le `setQueryDefaults` sur `['pokedex', 'detail']` dans `main.tsx`, qui couvre les fiches
  réparties par lots en plus de celles demandées à l'unité.
- **L'API Resource Timing ment sur les ressources cross-origin.** Sans en-tête
  `Timing-Allow-Origin`, `transferSize` et `decodedBodySize` valent toujours `0` : s'en servir
  pour distinguer une requête réussie d'une requête échouée donne un compte entièrement faux.
- **Une fiche doit survivre en mémoire pour être persistée.** Avec le `gcTime` par défaut, elle
  quitte le cache cinq minutes après avoir été fermée, donc avant la prochaine écriture sur
  disque, et ne serait jamais écrite. D'où le `gcTime: Infinity` sur les requêtes de détail.
- **Les sprites sont servis sans CORS**, donc leurs réponses sont opaques et portent le statut
  `0`. Sans `cacheableResponse: { statuses: [0, 200] }`, Workbox les rejetterait en silence et
  le cache resterait vide.
- **`distinct_on` évite d'avoir à choisir un jeu de référence pour les capacités.** Un Pokémon
  absent d'Écarlate/Violet n'y apprend rien ; interroger un seul `version_group` laisserait donc
  des listes vides. Combiné à `order_by: version_group_id desc`, `distinct_on: move_id` renvoie
  directement une ligne par attaque, celle du jeu le plus récent où elle s'apprend.
- **Une hauteur *minimale* casse la virtualisation.** Le sélecteur d'équipe était en `min-h-dvh` :
  la colonne s'étirant à la taille de son contenu, la zone en `overflow-y` ne défilait plus et le
  virtualiseur montait les 1025 lignes d'un coup. `h-dvh` contraint la colonne, et le DOM retombe
  à dix-sept lignes.
- **Une barre collante s'imbrique, elle ne se cale pas par un décalage mesuré.** Pour accrocher la
  barre de résultats sous l'en-tête, la première version mesurait la hauteur de celui-ci en
  JavaScript et la publiait en variable CSS. Mauvaise idée : la hauteur change avec la largeur de
  la fenêtre — sous `sm`, la recherche passe à la ligne et l'en-tête gagne une rangée — et tant que
  la mesure n'est pas rafraîchie, la barre recouvre l'en-tête. Elle est donc rendue **dans**
  l'en-tête, qui est déjà collant : plus rien à synchroniser. Son décalage à gauche au-delà de `lg`
  vient de `--largeur-filtres`, la même variable que la colonne de filtres, pour qu'ils ne dérivent
  pas l'un de l'autre.
- **L'état interne d'un composant survit tant qu'il ne se démonte pas.** Entre les deux choix d'un
  même tour, l'écran reste sur `choix` : le panneau d'action n'est jamais démonté, et un joueur qui
  venait d'ouvrir « Changer de Pokémon » passait la main à un adversaire dont le tour s'ouvrait sur
  la liste de changement au lieu de ses attaques. Une `key` portant le camp et le Pokémon force le
  remontage.
- **Une tape doit changer quelque chose de *visible*, pas nécessairement le texte.** Les événements
  muets — les dégâts, dont c'est la barre de vie qui parle — avaient d'abord été groupés avec la
  phrase qui les précède, pour qu'aucune tape ne semble ignorée. Mauvais critère : l'ordre du
  moteur est `attaque → [critique] → [efficacité] → dégâts`, si bien que les dégâts ne se
  détachaient de l'annonce que lorsqu'une ligne d'efficacité s'intercalait. Sur un échange neutre,
  le premier attaquant voyait donc la jauge tomber après une tape et le second sans en donner —
  deux rythmes pour la même action. Chaque événement a désormais son étape : la jauge se déclenche
  toujours, et la ligne précédente reste affichée pendant qu'elle se vide, comme dans les jeux.
- **Deux cibles plein écran qui se succèdent, c'est une tape qui traverse.** La surface qui déroule
  le récit et l'écran de passage occupent tous deux la fenêtre entière : sans précaution, la tape
  qui révèle la dernière réplique franchit l'écran de passage dans la foulée, et le joueur suivant
  découvre l'arène sans avoir vu qu'on lui passait la main. Un verrou de 250 ms
  (`use-tap-lock.ts`), réarmé à chaque réplique et à chaque changement d'écran, absorbe aussi les
  double-tapes involontaires. Les boutons de fin de combat en bénéficient : ils apparaissent
  exactement sous le doigt qui vient de dérouler la dernière ligne.
- **La surface de progression reste montée sous l'écran de passage** plutôt que d'être retirée : la
  démonter rendrait les tapes au contenu qu'elle protège. Le clavier, lui, l'atteint encore — d'où
  la garde sur `passage` dans `avancerReplique`, sans quoi une barre d'espace de trop reposerait un
  écran de passage déjà en place.
- **Un écran qui masque ne doit pas apparaître en fondu.** L'écran de passage entre les deux joueurs
  était monté avec une transition d'opacité : le temps qu'elle se joue, le choix à cacher restait
  lisible par transparence — et si les images s'interrompent, le voile peut ne jamais devenir
  opaque. Il est désormais opaque dès la première image, sans animation d'entrée ni de sortie.
- **Les sprites du jeu sont du pixel art minuscule** : la face de Bulbizarre fait 45 × 49 px pour un
  cadre cinq fois plus grand. Les agrandir en lissant les rend flous ; `image-rendering: pixelated`
  restitue le rendu d'origine. Seule l'illustration officielle, en haute définition, reste lissée.
- **`size-[n%]` ne donne pas un carré.** Le pourcentage se rapporte à la largeur du parent pour la
  largeur et à sa hauteur pour la hauteur : dans une arène en 16/10, la boîte obtenue est aplatie et
  les sprites s'y retrouvent tassés. `aspect-square` avec une largeur en pourcentage, lui, tient.
- **Les capacités des formes sont trouées, dans les deux sens.** Prendre le vivier de la forme
  seule condamnerait 50 des 219 formes jouables à se battre à Lutte — les Méga de Legends Z-A et
  les Gigamax n'ont aucune capacité dans l'API. Mais prendre celui de l'espèce seule priverait 32
  formes de leur seule attaque du bon type : Ossatueur apprend le Feu par CT, jamais le Spectre,
  que sa forme d'Alola est seule à porter. D'où **l'union des deux viviers**, gratuite puisque la
  requête prend déjà une liste : douze identifiants tiennent dans le même aller-retour que six.
- **Le total des statistiques ne distingue pas les formes.** Les quatre Deoxys pèsent 600 chacune et
  ne diffèrent que par la répartition. La feuille de choix affiche donc les deux statistiques les
  plus fortes — sans quoi elle proposerait quatre lignes identiques pour quatre Pokémon qui se
  jouent de façons opposées.
- **Un emplacement d'équipe fait 108 px de large sur mobile.** En ligne, sprite et croix ne
  laissaient qu'une vingtaine de pixels au nom : même « Deoxys » était tronqué. La disposition est
  passée en colonne, et la croix en surimpression dans le coin, ce qui rend la largeur entière au
  libellé — nécessaire dès qu'il s'agit d'« Ossatueur d'Alola ».
- **Un état de repli d'image doit se réinitialiser avec la source.** Le composant qui descend la
  chaîne des sprites retient l'étape atteinte ; sans remise à zéro, un Pokémon dont l'image
  manquait faisait démarrer le suivant sur son propre repli. L'étape est donc dérivée de la source
  courante plutôt que laissée à la discipline de l'appelant.
- **`{/* … */}` n'est pas valide en position d'attribut JSX.** Un commentaire glissé entre deux
  attributs casse la compilation, et Vite se contente alors de ne pas recharger le module : la page
  continue de tourner sur l'ancienne version, ce qui donne toutes les apparences d'une modification
  sans effet.

### Structure

```
src/
├── api/        client GraphQL, requêtes, normalisation des réponses
├── lib/        recherche, filtres, table des types, sprites, formatage
│   └── battle/ moteur de combat : stats, dégâts, RNG à graine, attaques, formes, tours
├── hooks/      index, fiche, attaques, formes, filtres (URL), favoris, thème, cri, inclinaison 3D
├── components/ layout · grid · filters · detail · battle · ui
└── pages/      PokedexPage · BattlePage
```

`src/api/normalize.ts` est le seul fichier qui connaît la forme brute de l'API : il aplatit les
réponses GraphQL en modèles simples utilisés partout ailleurs.

## Déploiement

Le site est entièrement statique. `netlify.toml` contient déjà la configuration :

| Réglage | Valeur |
| --- | --- |
| Commande de build | `npm run build` |
| Dossier publié | `dist` |
| Node | 22 |

Deux points méritent l'attention :

- **Le repli SPA** (`/*` → `/index.html`, statut 200) est indispensable. Les routes sont
  résolues côté client : sans lui, ouvrir directement `/pokemon/149` renverrait un 404.
- **`sw.js` et `manifest.webmanifest` sont servis en `no-cache`.** Le service worker pilote les
  mises à jour ; mis en cache longue durée, il figerait l'application chez les visiteurs. Les
  bundles, eux, portent une empreinte dans leur nom et sont donc marqués `immutable`.

## Scripts

| Commande | Effet |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run build` | Vérification des types puis build de production |
| `npm run preview` | Sert le build de production |
| `npm run lint` | oxlint |
| `npm run verify:battle` | Contrôle le moteur de combat sur des valeurs de référence |

## Crédits

Données et illustrations : [PokéAPI](https://pokeapi.co) · Pokémon est une marque de Nintendo,
Game Freak et The Pokémon Company. Projet non officiel, à but éducatif.
