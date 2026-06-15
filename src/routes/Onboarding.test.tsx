import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../lib/supabase', () => ({ supabase: {} }))
vi.mock('../context/AuthProvider', () => ({ useAuth: () => ({ session: null, loading: false }) }))
vi.mock('../context/HouseholdProvider', () => ({ useHousehold: () => ({ refresh: vi.fn() }) }))

import Onboarding from './Onboarding'

function renderPage() {
  return render(<MemoryRouter><Onboarding /></MemoryRouter>)
}

describe('Onboarding dynamic kids', () => {
  beforeEach(() => vi.clearAllMocks())

  it('starts with no kid inputs', () => {
    renderPage()
    expect(screen.queryByLabelText('Kid 1 name')).not.toBeInTheDocument()
  })

  it('adds kid inputs when "Add a kid" is clicked', async () => {
    renderPage()
    await userEvent.click(screen.getByText('+ Add a kid'))
    await userEvent.click(screen.getByText('+ Add a kid'))
    expect(screen.getByLabelText('Kid 1 name')).toBeInTheDocument()
    expect(screen.getByLabelText('Kid 2 name')).toBeInTheDocument()
  })

  it('removes a kid input', async () => {
    renderPage()
    await userEvent.click(screen.getByText('+ Add a kid'))
    await userEvent.click(screen.getByLabelText('Remove kid 1'))
    expect(screen.queryByLabelText('Kid 1 name')).not.toBeInTheDocument()
  })
})
