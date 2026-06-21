import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import PoolManager from '../components/PoolManager'
import PlanDays from '../components/PlanDays'

type PlanMode = 'pool' | 'days'

export default function Plan() {
  const location = useLocation()
  const state = (location.state as { mode?: PlanMode; date?: string } | null) ?? null
  const [mode, setMode] = useState<PlanMode>(state?.mode ?? 'pool')

  return (
    <div className="px-4 pt-6">
      <h1 className="text-2xl font-bold text-brand">Plan</h1>

      {/* Mode toggle */}
      <div role="tablist" aria-label="Plan mode" className="flex mt-4 bg-brand-soft rounded-xl p-1">
        {([
          ['pool', 'Pool'],
          ['days', 'Days'],
        ] as const).map(([value, label]) => (
          <button key={value} type="button" role="tab" aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={`flex-1 text-sm font-semibold rounded-lg py-2 ${
              mode === value ? 'bg-brand text-white' : 'text-gray-500'
            }`}>
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {mode === 'pool' ? <PoolManager /> : <PlanDays initialDate={state?.date} />}
      </div>
    </div>
  )
}
