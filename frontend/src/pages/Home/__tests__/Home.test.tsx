import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import HomePage from '../Home'
import { renderWithProviders } from '../../../test/renderWithProviders'

vi.mock('../../../services/serviceApi', () => ({
  serviceApi: {
    health: vi.fn().mockResolvedValue({ status: 'ok' }),
    session: vi.fn().mockResolvedValue({ authenticated: false, role: 'guest' }),
  },
}))

describe('Home page', () => {
  it('shows successful API bootstrap status', async () => {
    renderWithProviders(<HomePage />)
    expect(await screen.findByText(/API: подключено/i)).toBeInTheDocument()
  })
})

