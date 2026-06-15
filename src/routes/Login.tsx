import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Login() {
  const nav = useNavigate()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email, password })
      setBusy(false)
      if (error) { setError(error.message); return }
      if (!data.session) { setError('Account created — check your email to confirm, then sign in.'); setMode('signin'); return }
      nav('/')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      setBusy(false)
      if (error) { setError(error.message); return }
      nav('/')
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-brand mb-1">Meal Planner</h1>
      <p className="text-gray-500 mb-6">{mode === 'signup' ? 'Create your account' : 'Welcome back'}</p>
      <form onSubmit={submit} className="space-y-3">
        <input className="w-full border rounded-xl p-3" type="email" placeholder="Email"
          value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="w-full border rounded-xl p-3" type="password" placeholder="Password"
          value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button disabled={busy} className="w-full bg-brand text-white font-bold rounded-xl p-3 disabled:opacity-50">
          {busy ? '…' : mode === 'signup' ? 'Sign up' : 'Sign in'}
        </button>
      </form>
      <button className="mt-4 text-brand text-sm" onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}>
        {mode === 'signup' ? 'Have an account? Sign in' : "New here? Create an account"}
      </button>
    </div>
  )
}
