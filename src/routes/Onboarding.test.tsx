import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const { mockRpc, mockRefresh } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockRefresh: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({ supabase: { rpc: mockRpc } }))
vi.mock('../context/AuthProvider', () => ({ useAuth: () => ({ session: { user: { id: 'u1' } }, loading: false }) }))
vi.mock('../context/HouseholdProvider', () => ({ useHousehold: () => ({ refresh: mockRefresh }) }))
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => vi.fn() }
})

import Onboarding from './Onboarding'

function renderPage() {
  return render(<MemoryRouter><Onboarding /></MemoryRouter>)
}

describe('Onboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRpc.mockResolvedValue({ data: 'hh-123', error: null })
  })

  it('renders with one default member row', () => {
    renderPage()
    expect(screen.getByLabelText('Member 1 name')).toBeInTheDocument()
    expect(screen.queryByLabelText('Member 2 name')).not.toBeInTheDocument()
  })

  it('adds a second member row when "Add a family member" is clicked', async () => {
    renderPage()
    await userEvent.click(screen.getByText('+ Add a family member'))
    expect(screen.getByLabelText('Member 1 name')).toBeInTheDocument()
    expect(screen.getByLabelText('Member 2 name')).toBeInTheDocument()
  })

  it('removes a member row', async () => {
    renderPage()
    await userEvent.click(screen.getByText('+ Add a family member'))
    // now 2 members; remove first — second shifts to Member 1
    await userEvent.click(screen.getByLabelText('Remove member 1'))
    expect(screen.getByLabelText('Member 1 name')).toBeInTheDocument()
    expect(screen.queryByLabelText('Member 2 name')).not.toBeInTheDocument()
  })

  it('shows validation error when household name is empty', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Create household' }))
    expect(await screen.findByText('Household name is required')).toBeInTheDocument()
  })

  it('calls create_household_with_setup RPC with p_members array on happy path', async () => {
    renderPage()
    await userEvent.type(screen.getByPlaceholderText('e.g. Star Family'), 'Test Family')
    await userEvent.type(screen.getByPlaceholderText('e.g. Mouni'), 'Mouni')
    await userEvent.click(screen.getByRole('button', { name: 'Create household' }))

    expect(mockRpc).toHaveBeenCalledWith('create_household_with_setup', expect.objectContaining({
      p_name: 'Test Family',
      p_display_name: 'Mouni',
      p_members: expect.arrayContaining([
        expect.objectContaining({
          sex: expect.any(String),
          age: expect.any(Number),
          weight_kg: expect.any(Number),
          activity_level: expect.any(String),
        }),
      ]),
    }))
    const callArg = mockRpc.mock.calls[0][1]
    expect(callArg.p_members.length).toBeGreaterThanOrEqual(1)
    expect(callArg).not.toHaveProperty('p_kids')
    expect(callArg).not.toHaveProperty('p_adults')
  })

  it('shows pediatric note for members under 18', async () => {
    renderPage()
    const ageInput = screen.getByLabelText('Member 1 age')
    await userEvent.clear(ageInput)
    await userEvent.type(ageInput, '10')
    expect(await screen.findByText(/pediatric values/i)).toBeInTheDocument()
    expect(screen.queryByLabelText('Member 1 activity')).not.toBeInTheDocument()
  })
})
