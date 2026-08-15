import { useState } from 'react'
import type { Ability, FlavorEntry, PokemonDetail, PokemonForm } from '@/api/models'
import {
  formatCaptureRate,
  formatGenderRate,
  formatGrowthRate,
  formatHatchSteps,
  formatHeight,
  formatWeight,
} from '@/lib/format'
import { GENERATIONS } from '@/lib/pokemon-types'

/* ------------------------------------------------------------------ *
 * Sélecteur de formes
 * ------------------------------------------------------------------ */

export function FormSelector({
  forms,
  activeId,
  onSelect,
}: {
  forms: PokemonForm[]
  activeId: number
  onSelect: (id: number) => void
}) {
  if (forms.length < 2) return null

  // Certaines espèces ont une vingtaine de formes (Pikachu, Motisma) :
  // on plafonne la hauteur pour qu'elles n'écrasent pas l'en-tête.
  return (
    <div className="stable-gutter flex max-h-[5.5rem] flex-wrap gap-1.5 overflow-y-auto">
      {forms.map((form) => (
        <button
          key={form.id}
          type="button"
          onClick={() => onSelect(form.id)}
          aria-pressed={form.id === activeId}
          title={form.name}
          className={`rounded-full px-3 py-1.5 font-semibold text-xs transition ${
            form.id === activeId
              ? 'bg-white text-slate-900'
              : 'bg-white/15 text-white hover:bg-white/25'
          }`}
        >
          {form.shortName}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Descriptions du Pokédex
 * ------------------------------------------------------------------ */

export function PokedexEntries({ entries }: { entries: FlavorEntry[] }) {
  const [selected, setSelected] = useState(0)

  if (!entries.length) {
    return <p className="text-ink-faint text-sm">Aucune description enregistrée.</p>
  }

  // Le nombre d'entrées varie d'un Pokémon à l'autre : on borne l'index
  // plutôt que de le réinitialiser dans un effet.
  const index = Math.min(selected, entries.length - 1)
  const entry = entries[index]
  const untranslated = entry.lang === 'en'

  return (
    <div className="space-y-3">
      {entries.length > 1 && (
        <div className="flex items-center gap-2">
          <label htmlFor="pokedex-version" className="text-ink-faint text-xs">
            Jeu
          </label>
          <select
            id="pokedex-version"
            value={index}
            onChange={(event) => setSelected(Number(event.target.value))}
            className="min-w-0 flex-1 rounded-lg border border-line bg-panel-soft px-2.5 py-1.5 text-ink text-xs outline-none transition hover:border-accent/50 focus:border-accent"
          >
            {entries.map((item, position) => (
              <option key={`${item.version ?? 'sans-jeu'}-${position}`} value={position}>
                {item.version ? `Pokémon ${item.version}` : `Description ${position + 1}`}
              </option>
            ))}
          </select>
          <span className="shrink-0 text-[11px] text-ink-faint tabular-nums">
            {index + 1} / {entries.length}
          </span>
        </div>
      )}

      {untranslated && (
        <p className="rounded-lg bg-panel-soft px-3 py-2 text-ink-faint text-xs">
          Les descriptions françaises ne sont pas encore publiées pour ce Pokémon — texte original
          affiché.
        </p>
      )}

      <figure className="border-accent/40 border-l-2 pl-3">
        <blockquote className="text-ink text-sm leading-relaxed">{entry.text}</blockquote>
        {entry.version && (
          <figcaption className="mt-1.5 text-[11px] text-ink-faint">
            Pokémon {entry.version}
          </figcaption>
        )}
      </figure>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Talents
 * ------------------------------------------------------------------ */

export function AbilityList({ abilities }: { abilities: Ability[] }) {
  if (!abilities.length) {
    return <p className="text-ink-faint text-sm">Aucun talent connu.</p>
  }

  return (
    <div className="space-y-2">
      {abilities.map((ability) => (
        <div key={`${ability.slug}-${String(ability.isHidden)}`} className="rounded-xl bg-panel-soft p-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-ink text-sm">{ability.name}</span>
            {ability.isHidden && (
              <span className="rounded-full bg-accent/15 px-2 py-0.5 font-semibold text-[10px] text-accent uppercase tracking-wide">
                Caché
              </span>
            )}
          </div>
          {ability.description && (
            <p className="mt-1 text-ink-soft text-xs leading-relaxed">{ability.description}</p>
          )}
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Fiche d'identité
 * ------------------------------------------------------------------ */

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-line border-b py-2 last:border-b-0">
      <dt className="text-ink-faint text-xs">{label}</dt>
      <dd className="text-right font-semibold text-ink text-sm">{value}</dd>
    </div>
  )
}

export function InfoGrid({ detail, form }: { detail: PokemonDetail; form: PokemonForm }) {
  const generation = GENERATIONS.find((item) => item.id === detail.generation)

  return (
    <dl className="grid gap-x-8 sm:grid-cols-2">
      <InfoRow label="Taille" value={formatHeight(form.height)} />
      <InfoRow label="Poids" value={formatWeight(form.weight)} />
      <InfoRow
        label="Génération"
        value={generation ? `${generation.label} · ${generation.region}` : `Gen ${detail.generation}`}
      />
      <InfoRow label="Taux de capture" value={formatCaptureRate(detail.captureRate)} />
      <InfoRow label="Sexe" value={formatGenderRate(detail.genderRate)} />
      <InfoRow
        label="Groupes d'œufs"
        value={detail.eggGroups.length ? detail.eggGroups.join(', ') : '—'}
      />
      {detail.hatchCounter !== null && (
        <InfoRow label="Éclosion" value={formatHatchSteps(detail.hatchCounter)} />
      )}
      <InfoRow label="Croissance" value={formatGrowthRate(detail.growthRate) ?? '—'} />
      {detail.habitat && <InfoRow label="Habitat" value={detail.habitat} />}
      {detail.shape && <InfoRow label="Silhouette" value={detail.shape} />}
      {detail.baseHappiness !== null && (
        <InfoRow label="Bonheur de base" value={String(detail.baseHappiness)} />
      )}
      {form.baseExperience !== null && (
        <InfoRow label="Expérience de base" value={String(form.baseExperience)} />
      )}
    </dl>
  )
}
