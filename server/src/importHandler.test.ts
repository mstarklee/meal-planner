import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./openai', () => ({ callOpenAI: vi.fn() }))
vi.mock('./extract', () => ({ fetchBlogText: vi.fn(), fetchYoutubeText: vi.fn() }))

import { handleImport } from './importHandler'
import { callOpenAI } from './openai'
import { fetchBlogText } from './extract'

const MODEL_OUT = {
  name: 'Tomato Soup', meal_types: ['lunch'], tags: ['veg'],
  nutrients: { calories: 180, protein: 5, fiber: 4 }, nutrition_estimated: true,
  ingredients: [{ amount: '2', item: 'tomatoes' }], steps: ['Blend', 'Heat'],
}

describe('handleImport', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns a validated draft for pasted text', async () => {
    vi.mocked(callOpenAI).mockResolvedValue(MODEL_OUT)
    const { draft } = await handleImport({ source: 'text', text: 'tomato soup recipe' }, 'key')
    expect(draft.name).toBe('Tomato Soup')
    expect(draft.link_url).toBe('')
    expect(draft.ingredients).toEqual([{ amount: '2', item: 'tomatoes' }])
    expect(draft.nutrients.calories).toBe(180)
  })

  it('fetches blog text and stamps the source url as link_url', async () => {
    vi.mocked(fetchBlogText).mockResolvedValue('some recipe text')
    vi.mocked(callOpenAI).mockResolvedValue(MODEL_OUT)
    const { draft } = await handleImport({ source: 'blog', url: 'https://x.test/r' }, 'key')
    expect(fetchBlogText).toHaveBeenCalledWith('https://x.test/r')
    expect(draft.link_url).toBe('https://x.test/r')
  })

  it('rejects an invalid body', async () => {
    await expect(handleImport({ source: 'text' }, 'key')).rejects.toThrow()
  })
})
