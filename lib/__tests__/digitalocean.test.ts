import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DigitalOceanProvider } from '../providers/digitalocean'

const mockDropletResponse = {
  droplets: [
    {
      id: 123, name: 'open-claw-hal', tags: [],
      networks: { v4: [{ type: 'private', ip_address: '10.0.0.1' }, { type: 'public', ip_address: '1.2.3.4' }] },
    },
    {
      id: 456, name: 'open-claw-marvin', tags: [],
      networks: { v4: [{ type: 'public', ip_address: '5.6.7.8' }] },
    },
    {
      id: 789, name: 'my-web-server', tags: [],
      networks: { v4: [{ type: 'public', ip_address: '9.9.9.9' }] },
    },
  ],
}

describe('DigitalOceanProvider', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('listInstances returns only openclaw droplets', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve(mockDropletResponse),
    }))
    const provider = new DigitalOceanProvider('test-token')
    const result = await provider.listInstances()
    expect(result).toEqual([
      { providerId: '123', name: 'open-claw-hal', ip: '1.2.3.4' },
      { providerId: '456', name: 'open-claw-marvin', ip: '5.6.7.8' },
    ])
  })

  it('listInstances throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' }))
    const provider = new DigitalOceanProvider('bad-token')
    await expect(provider.listInstances()).rejects.toThrow('Digital Ocean API error: 401 Unauthorized')
  })

  it('type is digitalocean', () => {
    expect(new DigitalOceanProvider('token').type).toBe('digitalocean')
  })

  it('powerOffInstance posts power_off and polls until completed', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true, json: () => Promise.resolve({ action: { id: 42, status: 'in-progress' } }),
      })
      .mockResolvedValueOnce({
        ok: true, json: () => Promise.resolve({ action: { id: 42, status: 'completed' } }),
      })
    vi.stubGlobal('fetch', fetchMock)
    const provider = new DigitalOceanProvider('test-token')
    const result = await provider.powerOffInstance('123')
    expect(result).toEqual({ success: true })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.digitalocean.com/v2/droplets/123/actions',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ type: 'power_off' }) })
    )
  })

  it('powerOffInstance treats already-off 422 as success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 422, text: () => Promise.resolve('Droplet is already powered off.'),
    }))
    const provider = new DigitalOceanProvider('test-token')
    expect(await provider.powerOffInstance('123')).toEqual({ success: true })
  })

  it('destroyInstance deletes the droplet', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 })
    vi.stubGlobal('fetch', fetchMock)
    const provider = new DigitalOceanProvider('test-token')
    expect(await provider.destroyInstance('123')).toEqual({ success: true })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.digitalocean.com/v2/droplets/123',
      expect.objectContaining({ method: 'DELETE' })
    )
  })

  it('destroyInstance treats 404 as already destroyed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 404, text: () => Promise.resolve('not found'),
    }))
    const provider = new DigitalOceanProvider('test-token')
    expect(await provider.destroyInstance('123')).toEqual({ success: true })
  })

  it('destroyInstance surfaces non-retryable API errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 403, text: () => Promise.resolve('forbidden'),
    }))
    const provider = new DigitalOceanProvider('test-token')
    const result = await provider.destroyInstance('123')
    expect(result.success).toBe(false)
    expect(result.error).toContain('403')
  })
})
