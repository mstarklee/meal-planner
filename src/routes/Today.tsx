import { supabase } from '../lib/supabase'

export default function Today() {
  return (
    <div className="px-4 pt-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-brand">Today</h1>
        <button className="text-sm text-gray-400" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
      <p className="text-gray-500 mt-2">Coming soon.</p>
    </div>
  )
}
