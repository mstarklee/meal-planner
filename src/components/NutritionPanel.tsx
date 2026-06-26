import { useState } from 'react'
import { NUTRIENT_GROUPS, GROUP_LABELS, nutrientsByGroup, type NutrientMap } from '../lib/nutrients'
import { buildNutrientRows } from '../lib/nutrition'
import Icon from './Icon'

interface Props {
  values: NutrientMap // per person
  targetsAdult: Record<string, number>
  targetsKid: Record<string, number>
  estimated?: boolean
}

export default function NutritionPanel({ values, targetsAdult, targetsKid, estimated }: Props) {
  const [who, setWho] = useState<'adult' | 'kid'>('adult')
  const targets = who === 'adult' ? targetsAdult : targetsKid

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="eyebrow">Nutrition · per person</h2>
        <div className="flex gap-1">
          {(['adult', 'kid'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setWho(t)}
              className={`text-[11px] font-semibold rounded-full px-2.5 py-0.5 ${who === t ? 'bg-terracotta text-bone-surface' : 'bg-ink/5 text-ink-soft'}`}>
              {t === 'adult' ? 'Adult' : 'Kid'}
            </button>
          ))}
        </div>
      </div>

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
