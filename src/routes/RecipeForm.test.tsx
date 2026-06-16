import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../lib/recipes', () => ({
  getRecipe: vi.fn(),
  createRecipe: vi.fn(),
  updateRecipe: vi.fn(),
  uploadRecipePhoto: vi.fn(),
}))
vi.mock('../context/HouseholdProvider', () => ({ useHousehold: () => ({ householdId: 'h1' }) }))
let mockParams: { id?: string } = {}
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useParams: () => mockParams, useNavigate: () => vi.fn() }
})

import RecipeForm from './RecipeForm'
import { createRecipe, getRecipe, updateRecipe } from '../lib/recipes'
import type { Recipe } from '../lib/recipe'

function renderForm() {
  return render(<RecipeForm />)
}

const existingRecipe: Recipe = {
  id: 'r1', household_id: 'h1', created_by: 'u1', created_at: '2026-06-15T00:00:00Z',
  name: 'Existing Dish', photo_url: '', link_url: '',
  meal_types: ['dinner'], tags: ['healthy'],
  calories: 400, protein: 30, fiber: 8, nutrition_estimated: false,
  ingredients: [{ amount: '2', item: 'eggs' }], steps: ['Cook it'], is_shared: false,
}

describe('RecipeForm', () => {
  beforeEach(() => { vi.clearAllMocks(); mockParams = {} })

  it('renders blank for new', () => {
    renderForm()
    expect(screen.getByLabelText('Name')).toHaveValue('')
    expect(screen.queryByLabelText('Ingredient 1 amount')).not.toBeInTheDocument()
  })

  it('adds an ingredient row', async () => {
    renderForm()
    await userEvent.click(screen.getByText('+ Add ingredient'))
    expect(screen.getByLabelText('Ingredient 1 amount')).toBeInTheDocument()
    expect(screen.getByLabelText('Ingredient 1 item')).toBeInTheDocument()
  })

  it('shows an error when submitting with an empty name', async () => {
    renderForm()
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(await screen.findByText('Name is required')).toBeInTheDocument()
    expect(createRecipe).not.toHaveBeenCalled()
  })

  it('calls createRecipe once with the normalized input on valid submit', async () => {
    vi.mocked(createRecipe).mockResolvedValue({ id: 'r1' } as never)
    renderForm()

    await userEvent.type(screen.getByLabelText('Name'), '  Veggie Bowl  ')
    await userEvent.click(screen.getByRole('button', { name: 'lunch' }))
    await userEvent.click(screen.getByText('+ Add ingredient'))
    await userEvent.type(screen.getByLabelText('Ingredient 1 amount'), '1 cup')
    await userEvent.type(screen.getByLabelText('Ingredient 1 item'), 'rice')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))

    expect(createRecipe).toHaveBeenCalledTimes(1)
    const [householdId, input] = vi.mocked(createRecipe).mock.calls[0]
    expect(householdId).toBe('h1')
    expect(input.name).toBe('Veggie Bowl')
    expect(input.meal_types).toContain('lunch')
    expect(input.ingredients).toEqual([{ amount: '1 cup', item: 'rice' }])
  })

  it('loads and populates an existing recipe in edit mode', async () => {
    mockParams = { id: 'r1' }
    vi.mocked(getRecipe).mockResolvedValue(existingRecipe)
    renderForm()
    expect(await screen.findByDisplayValue('Existing Dish')).toBeInTheDocument()
    expect(screen.getByLabelText('Ingredient 1 item')).toHaveValue('eggs')
    expect(screen.getByLabelText('Calories')).toHaveValue(400)
  })

  it('shows an error and exits loading when getRecipe fails in edit mode', async () => {
    mockParams = { id: 'r1' }
    vi.mocked(getRecipe).mockRejectedValue(new Error('network down'))
    renderForm()
    expect(await screen.findByText('network down')).toBeInTheDocument()
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
  })

  it('calls updateRecipe (not createRecipe) on valid submit in edit mode', async () => {
    mockParams = { id: 'r1' }
    vi.mocked(getRecipe).mockResolvedValue(existingRecipe)
    vi.mocked(updateRecipe).mockResolvedValue({ ...existingRecipe, name: 'Existing Dish Updated' })
    renderForm()

    const nameInput = await screen.findByDisplayValue('Existing Dish')
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, 'Existing Dish Updated')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))

    expect(updateRecipe).toHaveBeenCalledTimes(1)
    const [calledId, input] = vi.mocked(updateRecipe).mock.calls[0]
    expect(calledId).toBe('r1')
    expect(input.name).toBe('Existing Dish Updated')
    expect(createRecipe).not.toHaveBeenCalled()
  })
})
