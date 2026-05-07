/**
 * Frontend unit tests for sale group API functions in apps/web/src/lib/api.ts
 */
import { getSaleGroups, createSaleGroup, updateSaleGroup, deleteSaleGroup } from '../lib/api'

describe('Sale group API helpers', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // ── getSaleGroups ──────────────────────────────────────────────────────────

  describe('getSaleGroups', () => {
    it('calls GET /sales with credentials:include', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve([]),
        text: () => Promise.resolve(''),
      })

      await getSaleGroups()

      const [url, opts] = fetchMock.mock.calls[0]
      expect(url).toMatch(/\/sales$/)
      expect(opts?.credentials).toBe('include')
    })

    it('returns array when API returns an array directly', async () => {
      const mockData = [{ id: 'sg-1', currency: 'USD', totalAmount: 30, entries: [] }]
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockData),
        text: () => Promise.resolve(''),
      })

      const result = await getSaleGroups()

      expect(result).toEqual(mockData)
    })

    it('extracts .data when API returns paginated response', async () => {
      const mockData = [{ id: 'sg-1', currency: 'USD', totalAmount: 30, entries: [] }]
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: mockData, total: 1, page: 1, pageSize: 20, totalPages: 1 }),
        text: () => Promise.resolve(''),
      })

      const result = await getSaleGroups()

      expect(result).toEqual(mockData)
    })

    it('throws on non-ok response', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 403,
        text: () => Promise.resolve('Forbidden'),
      })

      await expect(getSaleGroups()).rejects.toThrow('Forbidden')
    })
  })

  // ── createSaleGroup ────────────────────────────────────────────────────────

  describe('createSaleGroup', () => {
    const baseData = {
      totalAmount: 30,
      currency: 'USD',
      platform: 'eBay',
      soldAt: '2024-06-01',
      priceDistribution: 'EQUAL' as const,
      entryIds: ['ube-1'],
    }

    it('calls POST /sales with JSON body and credentials:include', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ id: 'sg-new', ...baseData, entries: [] }),
        text: () => Promise.resolve(''),
      })

      await createSaleGroup(baseData)

      const [url, opts] = fetchMock.mock.calls[0]
      expect(url).toMatch(/\/sales$/)
      expect(opts?.method).toBe('POST')
      expect(opts?.credentials).toBe('include')
      expect(opts?.headers?.['Content-Type']).toBe('application/json')
      expect(JSON.parse(opts?.body as string)).toMatchObject(baseData)
    })

    it('sends CUSTOM distribution data with customAmounts', async () => {
      const customData = {
        ...baseData,
        priceDistribution: 'CUSTOM' as const,
        entryIds: ['ube-1', 'ube-2'],
        customAmounts: { 'ube-1': 10, 'ube-2': 20 },
      }
      fetchMock.mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ id: 'sg-new', ...customData, entries: [] }),
        text: () => Promise.resolve(''),
      })

      await createSaleGroup(customData)

      const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
      expect(body.priceDistribution).toBe('CUSTOM')
      expect(body.customAmounts).toEqual({ 'ube-1': 10, 'ube-2': 20 })
    })

    it('throws on non-ok response', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad Request'),
      })

      await expect(createSaleGroup(baseData)).rejects.toThrow('Bad Request')
    })
  })

  // ── updateSaleGroup ────────────────────────────────────────────────────────

  describe('updateSaleGroup', () => {
    it('calls PATCH /sales/:id with the update payload', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'sg-1', totalAmount: 50, entries: [] }),
        text: () => Promise.resolve(''),
      })

      await updateSaleGroup('sg-1', { totalAmount: 50 })

      const [url, opts] = fetchMock.mock.calls[0]
      expect(url).toMatch(/\/sales\/sg-1$/)
      expect(opts?.method).toBe('PATCH')
      expect(JSON.parse(opts?.body as string)).toEqual({ totalAmount: 50 })
    })

    it('throws on non-ok response', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 403,
        text: () => Promise.resolve('Forbidden'),
      })

      await expect(updateSaleGroup('sg-x', {})).rejects.toThrow('Forbidden')
    })
  })

  // ── deleteSaleGroup ────────────────────────────────────────────────────────

  describe('deleteSaleGroup', () => {
    it('calls DELETE /sales/:id with credentials:include', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(''),
      })

      await deleteSaleGroup('sg-1')

      const [url, opts] = fetchMock.mock.calls[0]
      expect(url).toMatch(/\/sales\/sg-1$/)
      expect(opts?.method).toBe('DELETE')
      expect(opts?.credentials).toBe('include')
    })

    it('throws on non-ok response', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not Found'),
      })

      await expect(deleteSaleGroup('sg-x')).rejects.toThrow('Not Found')
    })
  })
})
