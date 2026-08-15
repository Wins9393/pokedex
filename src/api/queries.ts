/**
 * Les deux seules requêtes de l'application.
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
 * Fiche complète d'une espèce : descriptions, élevage, chaîne
 * d'évolution entière et toutes ses formes (avec leurs types, stats,
 * talents et sprites propres).
 */
export const DETAIL_QUERY = /* GraphQL */ `
  query PokemonDetail($id: Int!) {
    species: pokemonspecies(where: { id: { _eq: $id } }) {
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
