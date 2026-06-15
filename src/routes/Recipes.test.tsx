import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../lib/recipes', () => ({
  listMyRecipes: vi.fn(),
  listSharedRecipes: vi.fn(),
}))
vi.mock('../context/HouseholdProvider', () => ({ useHousehold: () => ({ householdId: 'h1' }) }))

import Recipes from './Recipes'
import { listMyRecipes, listSharedRecipes } from '../lib/recipes'
import type { Recipe } from '../lib/recipe'

function makeRecipe(over: Partial<Recipe> & Pick<Recipe, 'id' | 'name'>): Recipe {
  return {
    household_id: 'h1', created_by: 'u1', created_at: '2026-06-15T00:00:00Z',
    photo_url: '', link_url: '', meal_types: ['dinner'], tags: [],
    calories: null, protein: null, fiber: null, nutrition_estimated: false,
    ingredients: [], steps: [], is_shared: false, ...over,
  }
}

function renderPage() {
  return render(<MemoryRouter><Recipes /></MemoryRouter>)
}

describe('Recipes library screen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listMyRecipes).mockResolvedValue([
      makeRecipe({ id: 'r1', name: 'Veggie Bowl', tags: ['veg'] }),
      makeRecipe({ id: 'r2', name: 'Protein Pancakes', tags: ['high-protein'] }),
    ])
    vi.mocked(listSharedRecipes).mockResolvedValue([])
  })

  it('loads and shows recipe names', async () => {
    renderPage()
    expect(await screen.findByText('Veggie Bowl')).toBeInTheDocument()
    expect(screen.getByText('Protein Pancakes')).toBeInTheDocument()
    expect(listMyRecipes).toHaveBeenCalledWith('h1')
  })

  it('filters by search, case-insensitively', async () => {
    renderPage()
    await screen.findByText('Veggie Bowl')
    await userEvent.type(screen.getByLabelText('Search recipes'), 'pancakes')
    expect(screen.getByText('Protein Pancakes')).toBeInTheDocument()
    expect(screen.queryByText('Veggie Bowl')).not.toBeInTheDocument()
  })

  it('shows a no-match message when search matches nothing', async () => {
    renderPage()
    await screen.findByText('Veggie Bowl')
    await userEvent.type(screen.getByLabelText('Search recipes'), 'zzzzz')
    expect(screen.getByText(/no recipes match/i)).toBeInTheDocument()
  })

  it('shows the base empty state when the shared library is empty', async () => {
    renderPage()
    await screen.findByText('Veggie Bowl')
    await userEvent.click(screen.getByRole('tab', { name: 'Shared Library' }))
    expect(await screen.findByText('No recipes yet — add your first.')).toBeInTheDocument()
    expect(listSharedRecipes).toHaveBeenCalled()
  })
})
