/**
 * Les requêtes de l'application.
 *
 * `language_id: 5` = français, `9` = anglais (filet de sécurité pour les
 * 127 espèces récentes dont les descriptions ne sont pas traduites).
 */

export const LANG_FR = 5
export const LANG_EN = 9

/**
 * Index complet : 1025 espèces + la matrice d'efficacité des types, en
 * un seul aller-retour. On interroge les espèces (et non les Pokémon)
 * pour obtenir exactement une entrée par numéro de Pokédex — sans quoi
 * des formes comme Ursaking Lune Vermeille apparaîtraient en double.
 */
export const INDEX_QUERY = /* GraphQL */ `
  query PokedexIndex {
    species: pokemonspecies(order_by: { id: asc }) {
      id
      generation_id
      is_legendary
      is_mythical
      is_baby
      capture_rate
      evolution_chain_id
      names: pokemonspeciesnames(where: { language_id: { _eq: ${LANG_FR} } }) {
        name
        genus
      }
      forms: pokemons(where: { is_default: { _eq: true } }, order_by: { id: asc }, limit: 1) {
        id
        name
        height
        weight
        base_experience
        types: pokemontypes(order_by: { slot: asc }) {
          type {
            name
          }
        }
        stats: pokemonstats(order_by: { stat_id: asc }) {
          base_stat
          stat {
            name
          }
        }
      }
    }
    efficacy: typeefficacy {
      damage_factor
      damage_type_id
      target_type_id
    }
  }
`

/**
 * Fiches complètes : descriptions, élevage, chaîne d'évolution entière et
 * toutes les formes (avec leurs types, stats, talents et sprites propres).
 *
 * La requête prend une **liste** d'identifiants, même quand une seule fiche
 * est demandée. C'est ce qui permet au téléchargement intégral de ramener le
 * dex en 52 requêtes plutôt qu'en 1025 : au-delà de deux cents appels
 * rapprochés, PokéAPI cesse de répondre, et un préchargement fiche par fiche
 * ne pouvait pas aboutir. Une fiche pèse ~23 Ko, donc un lot de vingt reste
 * une réponse de taille raisonnable.
 */
export const DETAIL_QUERY = /* GraphQL */ `
  query PokemonDetail($ids: [Int!]!) {
    species: pokemonspecies(where: { id: { _in: $ids } }, order_by: { id: asc }) {
      id
      generation_id
      capture_rate
      base_happiness
      gender_rate
      hatch_counter
      is_legendary
      is_mythical
      is_baby
      has_gender_differences
      names: pokemonspeciesnames(where: { language_id: { _eq: ${LANG_FR} } }) {
        name
        genus
      }
      frText: pokemonspeciesflavortexts(
        where: { language_id: { _eq: ${LANG_FR} } }
        order_by: { version_id: desc }
        limit: 16
      ) {
        flavor_text
        version {
          versionnames(where: { language_id: { _eq: ${LANG_FR} } }) {
            name
          }
        }
      }
      enText: pokemonspeciesflavortexts(
        where: { language_id: { _eq: ${LANG_EN} } }
        order_by: { version_id: desc }
        limit: 8
      ) {
        flavor_text
        version {
          versionnames(where: { language_id: { _eq: ${LANG_FR} } }) {
            name
          }
        }
      }
      eggGroups: pokemonegggroups {
        egggroup {
          name
          egggroupnames(where: { language_id: { _eq: ${LANG_FR} } }) {
            name
          }
        }
      }
      habitat: pokemonhabitat {
        pokemonhabitatnames(where: { language_id: { _eq: ${LANG_FR} } }) {
          name
        }
      }
      shape: pokemonshape {
        pokemonshapenames(where: { language_id: { _eq: ${LANG_FR} } }) {
          name
        }
      }
      growthrate {
        name
      }
      chain: evolutionchain {
        id
        links: pokemonspecies(order_by: { order: asc }) {
          id
          evolves_from_species_id
          names: pokemonspeciesnames(where: { language_id: { _eq: ${LANG_FR} } }) {
            name
          }
          default: pokemons(where: { is_default: { _eq: true } }, order_by: { id: asc }, limit: 1) {
            id
            types: pokemontypes(order_by: { slot: asc }) {
              type {
                name
              }
            }
          }
          evolutions: pokemonevolutions {
            min_level
            min_happiness
            min_beauty
            min_affection
            time_of_day
            needs_overworld_rain
            turn_upside_down
            relative_physical_stats
            evolutiontrigger {
              name
            }
            item {
              itemnames(where: { language_id: { _eq: ${LANG_FR} } }) {
                name
              }
            }
            ItemByHeldItemId {
              itemnames(where: { language_id: { _eq: ${LANG_FR} } }) {
                name
              }
            }
            move {
              movenames(where: { language_id: { _eq: ${LANG_FR} } }) {
                name
              }
            }
            type {
              name
            }
            location {
              locationnames(where: { language_id: { _eq: ${LANG_FR} } }) {
                name
              }
            }
            gender {
              name
            }
            PokemonspecyByTradeSpeciesId {
              pokemonspeciesnames(where: { language_id: { _eq: ${LANG_FR} } }) {
                name
              }
            }
          }
        }
      }
      variants: pokemons(order_by: { id: asc }) {
        id
        name
        is_default
        height
        weight
        base_experience
        pokemoncries {
          cries
        }
        pokemonsprites {
          sprites
        }
        pokemonforms(order_by: { form_order: asc }) {
          form_name
          is_mega
          is_battle_only
          pokemonformnames(where: { language_id: { _eq: ${LANG_FR} } }) {
            name
            pokemon_name
          }
        }
        types: pokemontypes(order_by: { slot: asc }) {
          type {
            name
          }
        }
        stats: pokemonstats(order_by: { stat_id: asc }) {
          base_stat
          stat {
            name
          }
        }
        abilities: pokemonabilities(order_by: { slot: asc }) {
          is_hidden
          ability {
            name
            abilitynames(where: { language_id: { _eq: ${LANG_FR} } }) {
              name
            }
            abilityflavortexts(
              where: { language_id: { _eq: ${LANG_FR} } }
              order_by: { version_group_id: desc }
              limit: 1
            ) {
              flavor_text
            }
          }
        }
      }
    }
  }
`

/* ------------------------------------------------------------------ *
 * Mode combat
 * ------------------------------------------------------------------ */

/**
 * Identifiants d'effets à écarter : ces attaques agissent sur deux tours
 * (Lance-Soleil charge, Ultralaser récupère, Vol disparaît puis frappe).
 * Le moteur ne simulant pas les tours d'attente, les garder reviendrait à
 * offrir leur puissance sans leur contrepartie.
 *
 * La liste n'est pas devinée : elle vient des textes d'effet de l'API,
 * filtrés sur les mentions de charge, de récupération et d'invulnérabilité.
 */
const EFFETS_DEUX_TOURS = [40, 152, 156, 256, 257, 264, 273, 312]

/**
 * Le vivier d'attaques du mode combat — 394 attaques, toutes nommées en
 * français, en une requête de 60 Ko (6 Ko compressés).
 *
 * Les exclusions sont pilotées par les données plutôt que par une liste de
 * noms à maintenir, et visent uniquement les attaques qu'ignorer leur effet
 * rendrait déséquilibrées :
 *
 * - `power` nul       → attaques de statut, hors sujet pour ce moteur
 * - `power` > 120     → gros coups à contrepartie (Ultralaser, Explosion)
 * - `drain` < 0       → contrecoup (Damoclès, Bélier)
 * - `min_hits` non nul→ coups multiples, dont la puissance est par coup
 * - catégorie `unique`→ mécaniques propres (Prescience frappe deux tours après)
 *
 * Les effets secondaires mineurs, eux, sont conservés mais non simulés :
 * Lance-Flammes inflige ses dégâts sans jamais brûler. Les exclure aurait
 * vidé le jeu de ses attaques emblématiques.
 */
export const MOVES_QUERY = /* GraphQL */ `
  query BattleMoves {
    move(
      order_by: { id: asc }
      where: {
        power: { _is_null: false, _lte: 120 }
        pp: { _is_null: false }
        move_effect_id: { _nin: [${EFFETS_DEUX_TOURS.join(', ')}] }
        movemeta: {
          drain: { _gte: 0 }
          min_hits: { _is_null: true }
          movemetacategory: { name: { _neq: "unique" } }
        }
      }
    ) {
      id
      power
      accuracy
      pp
      priority
      type {
        name
      }
      movedamageclass {
        name
      }
      movenames(where: { language_id: { _eq: ${LANG_FR} } }) {
        name
      }
    }
  }
`

/**
 * Les formes alternatives jouables : Méga, Primo, régionales, Motisma,
 * Deoxys… — 326 entrées avec leurs types, statistiques et noms français,
 * en une requête de 159 Ko (13 Ko compressés).
 *
 * On interroge `pokemon` et non `pokemonforms` : une forme n'est un choix
 * de combat que si elle a ses propres statistiques, et seule la table
 * `pokemon` en porte. Les déclinaisons purement décoratives (les casquettes
 * de Pikachu, les motifs de Prismillon) n'ont pas de ligne ici, ou en ont
 * une identique au défaut — c'est `formesJouables` qui les écarte, en
 * comparant à l'espèce plutôt qu'en tenant une liste de noms.
 *
 * `pokemon_name` plutôt que `name` pour le libellé : `name` dit « Forme de
 * Paldéa » pour les trois races de Tauros et « Forme 10 % » deux fois chez
 * Zygarde, alors que `pokemon_name` distingue chaque entrée.
 */
export const FORMS_QUERY = /* GraphQL */ `
  query BattleForms {
    pokemon(where: { is_default: { _eq: false } }, order_by: { id: asc }) {
      id
      speciesId: pokemon_species_id
      types: pokemontypes(order_by: { slot: asc }) {
        type {
          name
        }
      }
      stats: pokemonstats(order_by: { stat_id: asc }) {
        base_stat
        stat {
          name
        }
      }
      form: pokemonforms(order_by: { form_order: asc }, limit: 1) {
        form_name
        is_mega
        names: pokemonformnames(where: { language_id: { _eq: ${LANG_FR} } }) {
          name
          pokemon_name
        }
      }
    }
  }
`

/**
 * Les capacités apprises par un lot de Pokémon.
 *
 * `distinct_on: move_id` combiné à `version_group_id: desc` renvoie une
 * seule ligne par attaque, celle du jeu le plus récent où le Pokémon
 * l'apprend. Sans lui, il faudrait choisir un jeu de référence et gérer à
 * la main les Pokémon qui en sont absents — ceux qui ne figurent pas dans
 * Écarlate/Violet n'y ont aucune capacité.
 *
 * Méthodes 1 et 4 = montée de niveau et CT, les deux seules qui décrivent
 * ce qu'un Pokémon sait faire sans passer par un échange ou un événement.
 *
 * Interroger par lots plutôt qu'un par un : le dex entier tient en 18
 * requêtes (2,2 Mo, 121 Ko compressés).
 */
export const MOVESETS_QUERY = /* GraphQL */ `
  query PokemonMovesets($ids: [Int!]!) {
    pokemon(where: { id: { _in: $ids } }) {
      id
      moves: pokemonmoves(
        distinct_on: move_id
        order_by: [{ move_id: asc }, { version_group_id: desc }]
        where: { move_learn_method_id: { _in: [1, 4] } }
      ) {
        move_id
      }
    }
  }
`
