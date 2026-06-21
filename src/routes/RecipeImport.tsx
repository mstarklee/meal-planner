import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { importRecipe } from '../lib/recipeImport'
import type { ImportPayload } from '../lib/recipeImport'
import { draftToRecipeInput } from '../lib/recipeDraft'
import { fileToDownscaledDataUrl } from '../lib/image'
import TopBar from '../components/TopBar'

type Source = 'text' | 'photo' | 'blog' | 'youtube'
const SOURCES: { key: Source; label: string }[] = [
  { key: 'text', label: 'Paste text' },
  { key: 'photo', label: 'Photo' },
  { key: 'blog', label: 'Blog link' },
  { key: 'youtube', label: 'YouTube' },
]

export default function RecipeImport() {
  const nav = useNavigate()
  const [source, setSource] = useState<Source>('text')
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const [imageDataUrl, setImageDataUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) { return }
    setError(null)
    try { setImageDataUrl(await fileToDownscaledDataUrl(file, 1024)) }
    catch { setError('Could not read that image') }
  }

  function buildPayload(): ImportPayload | null {
    if (source === 'text') { return text.trim() ? { source, text } : null }
    if (source === 'photo') { return imageDataUrl ? { source, imageDataUrl } : null }
    return url.trim() ? { source, url } : null
  }

  async function generate() {
    const payload = buildPayload()
    if (!payload) { setError('Add something to import first'); return }
    setError(null)
    setBusy(true)
    try {
      const draft = await importRecipe(payload)
      nav('/recipes/new', { state: { draft: draftToRecipeInput(draft) } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
      setBusy(false)
    }
  }

  return (
    <>
      <TopBar variant="back" title="Import a recipe" />
      <div className="screen max-w-md mx-auto pt-4">
      <h1 className="font-display text-title font-semibold text-ink mb-1">Import a recipe</h1>
      <p className="text-gray-500 mb-5">AI reads the source and fills in a draft you can review.</p>

      <div role="tablist" aria-label="Import source" className="flex flex-wrap gap-2">
        {SOURCES.map((s) => (
          <button key={s.key} type="button" role="tab" aria-selected={source === s.key}
            onClick={() => { setSource(s.key); setError(null) }}
            className={`text-xs px-3 py-1.5 rounded-full font-semibold border ${
              source === s.key ? 'bg-brand text-white border-brand' : 'border-gray-300 text-gray-500'}`}>
            {s.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {source === 'text' && (
          <textarea aria-label="Recipe text" value={text} onChange={(e) => setText(e.target.value)} rows={8}
            placeholder="Paste a recipe or a message…" className="w-full border rounded-xl p-3" />
        )}
        {source === 'photo' && (
          <div>
            <input type="file" accept="image/*" aria-label="Recipe photo" onChange={onPhoto} />
            {imageDataUrl && <img src={imageDataUrl} alt="" className="w-full rounded-xl mt-3 object-cover" />}
          </div>
        )}
        {(source === 'blog' || source === 'youtube') && (
          <input type="url" aria-label={source === 'blog' ? 'Blog URL' : 'YouTube URL'} value={url}
            onChange={(e) => setUrl(e.target.value)} placeholder="https://…"
            className="w-full border rounded-xl p-3" />
        )}
      </div>

      {error && <p className="text-red-600 text-sm mt-4">{error}</p>}

      <button disabled={busy} onClick={generate}
        className="w-full mt-5 bg-brand text-white font-bold rounded-xl p-3 disabled:opacity-50">
        {busy ? 'Reading…' : 'Generate draft'}
      </button>
      <Link to="/recipes/new" className="block text-center text-terracotta font-semibold text-sm mt-3">
        Enter manually instead
      </Link>
      </div>
    </>
  )
}
