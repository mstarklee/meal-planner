import { useState } from 'react'
import { NUTRIENT_GROUPS, GROUP_LABELS, nutrientsByGroup, type NutrientMap } from '../lib/nutrients'
import { buildNutrientRows } from '../lib/nutrition'
import Icon from './Icon'

export interface TargetOption {
  id: string
  label: string
  targets: Record<string, number>
}

interface Props {
  values: NutrientMap // per person
  options: TargetOption[]
  estimated?: boolean
  /** Controlled selection — when provided, the panel reflects this id and omits its own chips. */
  selectedId?: string
  onSelect?: (id: string) => void
}

export default function NutritionPanel({ values, options, estimated, selectedId: controlledId, onSelect }: Props) {
  const [internalId, setInternalId] = useState(options[0]?.id ?? '')
  const controlled = controlledId !== undefined
  const selectedId = controlled ? controlledId : internalId
  const selected = options.find((o) => o.id === selectedId) ?? options[0]
  const targets = selected?.targets ?? {}

  return (
    <div className="space-y-4">
      {!controlled && (
        <div className="flex items-center justify-between">
          <h2 className="eyebrow">Nutrition · per person</h2>
          {options.length > 0 && (
            <div className="flex flex-wrap gap-1 justify-end">
              {options.map((o) => (
                <button key={o.id} type="button" onClick={() => (onSelect ? onSelect(o.id) : setInternalId(o.id))}
                  className={`text-[11px] font-semibold rounded-full px-2.5 py-0.5 ${selected?.id === o.id ? 'bg-terracotta text-bone-surface' : 'bg-ink/5 text-ink-soft'}`}>
                  {o.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {NUTRIENT_GROUPS.map((group) => {
        const rows = buildNutrientRows(values, targets, nutrientsByGroup(group))
        return (
          <div key={group}>
            <p className="eyebrow text-terracotta mb-2">{GROUP_LABELS[group]}</p>
            <div className="grid grid-cols-3 gap-2.5">
              {rows.map(({ def, value, target, pct }) => (
                <div key={def.key} className="rounded-xl border border-ink/10 bg-bone-surface/40 p-2.5">
                  <div className="flex items-center gap-1.5 text-olive">
                    <Icon name={def.icon} size={18} />
                    <span className="font-display text-[16px] leading-none text-ink nums">
                      {Math.round(value * 10) / 10}<span className="text-[11px] text-ink-faint">{def.unit && ` ${def.unit}`}</span>
                    </span>
                  </div>
                  <p className="mt-1.5 text-[12px] font-semibold text-ink">{def.label}</p>
                  <p className="text-[10.5px] text-ink-soft leading-snug">{def.why}</p>
                  <div className="mt-1.5 h-[3px] w-full rounded-full bg-ink/10 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, backgroundColor: pct >= 1 ? '#5e6b3f' : '#b8512e' }} />
                  </div>
                  <p className="mt-1 text-[10px] text-ink-faint nums">of {target}{def.unit && ` ${def.unit}`} / day</p>
                </div>
              ))}
            </div>
          </div>
        )
      })}
      {estimated && <p className="text-[11px] text-ink-faint">✺ Values AI-estimated · per person</p>}
    </div>
  )
}
