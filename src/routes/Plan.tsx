import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import PoolManager from '../components/PoolManager'
import PlanDays from '../components/PlanDays'
import ScreenHeader from '../components/ScreenHeader'
import TopBar from '../components/TopBar'
import SegmentedTabs from '../components/SegmentedTabs'

type PlanMode = 'pool' | 'days'

export default function Plan() {
  const location = useLocation()
  const state = (location.state as { mode?: PlanMode; date?: string } | null) ?? null
  const [mode, setMode] = useState<PlanMode>(state?.mode ?? 'pool')

  return (
    <>
      <TopBar />
      <div className="screen">
        <ScreenHeader eyebrow="This Week" title="Plan" />

        <SegmentedTabs
          ariaLabel="Plan mode"
          value={mode}
          onChange={setMode}
          options={[
            ['pool', 'Pool'],
            ['days', 'Days'],
          ] as const}
        />

        <div className="mt-5">
          {mode === 'pool' ? <PoolManager /> : <PlanDays initialDate={state?.date} />}
        </div>
      </div>
    </>
  )
}
