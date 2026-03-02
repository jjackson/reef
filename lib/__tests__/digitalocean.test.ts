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
})
