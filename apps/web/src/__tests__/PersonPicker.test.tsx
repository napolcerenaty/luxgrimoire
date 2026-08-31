import type { ComponentProps } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PersonPicker } from '../components/admin/pickers/PersonPicker'

vi.mock('../lib/authFetch', () => ({
  authFetch: vi.fn(),
}))

import { authFetch } from '../lib/authFetch'

function renderPicker(props: Partial<ComponentProps<typeof PersonPicker>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onAdd = vi.fn()
  render(
    <QueryClientProvider client={queryClient}>
      <PersonPicker endpoint="artists" placeholder="Search or create artist…" onAdd={onAdd} {...props} />
    </QueryClientProvider>,
  )
  return { onAdd }
}

describe('PersonPicker', () => {
  beforeEach(() => {
    vi.mocked(authFetch).mockReset()
  })

  it('shows the studio name next to a suggestion for an artist that belongs to one', async () => {
    vi.mocked(authFetch).mockResolvedValue({
      data: [
        { id: 'artist-1', name: 'Maggie', slug: 'maggie', studio: { name: '@the.butterfly.bookclub' } },
      ],
    })

    renderPicker({ initialQuery: 'Maggie' })

    const suggestion = await screen.findByRole('button', { name: /^Maggie/ })
    expect(suggestion).toHaveTextContent('Maggie — @the.butterfly.bookclub')
  })

  it('shows no studio suffix for an artist with no studio', async () => {
    vi.mocked(authFetch).mockResolvedValue({
      data: [{ id: 'artist-2', name: 'Solo Artist', slug: 'solo-artist', studio: null }],
    })

    renderPicker({ initialQuery: 'Solo' })

    const suggestion = await screen.findByRole('button', { name: /Solo Artist/ })
    expect(suggestion.textContent).toBe('Solo Artist')
  })

  it('does not render a studio suffix for the authors endpoint (no studio field)', async () => {
    vi.mocked(authFetch).mockResolvedValue({
      data: [{ id: 'author-1', name: 'Some Author', slug: 'some-author' }],
    })

    renderPicker({ endpoint: 'authors', initialQuery: 'Some' })

    const suggestion = await screen.findByRole('button', { name: /Some Author/ })
    expect(suggestion.textContent).toBe('Some Author')
  })

  it('calls onAdd with just id/name (not the studio) when a suggestion is picked', async () => {
    vi.mocked(authFetch).mockResolvedValue({
      data: [
        { id: 'artist-1', name: 'Maggie', slug: 'maggie', studio: { name: '@the.butterfly.bookclub' } },
      ],
    })

    const { onAdd } = renderPicker({ initialQuery: 'Maggie' })
    const suggestion = await screen.findByRole('button', { name: /^Maggie/ })
    await userEvent.click(suggestion)

    expect(onAdd).toHaveBeenCalledWith({ id: 'artist-1', name: 'Maggie' })
  })

  it('queries the compound "Name @handle" string as typed, unmodified, when prefilled from an AI-parsed credit', async () => {
    vi.mocked(authFetch).mockResolvedValue({ data: [] })

    renderPicker({ initialQuery: 'Maggie @the.butterfly.bookclub' })

    await waitFor(() => expect(authFetch).toHaveBeenCalled())
    const [path] = vi.mocked(authFetch).mock.calls[0]
    expect(path).toContain(encodeURIComponent('Maggie @the.butterfly.bookclub'))
  })
})
