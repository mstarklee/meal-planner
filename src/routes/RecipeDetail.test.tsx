import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../lib/recipes', () => ({ getRecipe: vi.fn(), deleteRecipe: vi.fn() }))
let mockUserId: string | undefined = 'u1'
vi.mock('../context/AuthProvider', () => ({
  useAuth: () => ({ session: mockUserId ? { user: { id: mockUserId } } : null }),
}))
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useParams: () => ({ id: 'r1' }), useNavigate: () => mockNavigate }
})

import RecipeDetail from './RecipeDetail'
import { getRecipe, deleteRecipe } from '../lib/recipes'
import type { Recipe } from '../lib/recipe'

const recipe: Recipe = {
  id: 'r1', household_id: 'h1', created_by: 'u1', created_at: '2026-06-15T00:00:00Z',
  name: 'Dal Tadka', photo_url: '', link_url: '',
  meal_types: ['dinner'], tags: [],
  nutrients: { calories: 420, protein: 22, fiber: 9 },
  nutrition_estimated: false, ingredients: [], steps: [], is_shared: false,
}

function renderDetail() {
  return render(<MemoryRouter><RecipeDetail /></MemoryRouter>)
}

describe('RecipeDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUserId = 'u1'
    vi.mocked(getRecipe).mockResolvedValue(recipe)
  })

  it('shows Edit and Delete to the creator', async () => {
    renderDetail()
    expect((await screen.findAllByText('Dal Tadka'))[0]).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /edit/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument()
  })

  it('hides Edit and Delete from non-creators', async () => {
    mockUserId = 'someone-else'
    renderDetail()
    expect((await screen.findAllByText('Dal Tadka'))[0]).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /edit/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()
  })

  it('does not delete when the confirm dialog is cancelled', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderDetail()
    await screen.findAllByText('Dal Tadka')
    await userEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(deleteRecipe).not.toHaveBeenCalled()
    expect(mockNavigate).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('deletes and navigates to /recipes when confirmed', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(deleteRecipe).mockResolvedValue()
    renderDetail()
    await screen.findAllByText('Dal Tadka')
    await userEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(deleteRecipe).toHaveBeenCalledWith('r1')
    await vi.waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/recipes'))
    confirmSpy.mockRestore()
  })
})
