import { describe, it, expect, vi, beforeEach } from 'vitest'
import { listOpenClawDroplets } from '../digitalocean'

const mockDropletResponse = {
  droplets: [
    {
      id: 123,
      name: 'open-claw-hal',
      tags: [],
      networks: {
        v4: [
          { type: 'private', ip_address: '10.0.0.1' },
          { type: 'public', ip_address: '1.2.3.4' },
        ],
      },
    },
    {
      id: 456,
      name: 'open-claw-marvin',
      tags: [],
      networks: {
        v4: [{ type: 'public', ip_address: '5.6.7.8' }],
      },
    },
    {
      id: 789,
      name: 'my-web-server',
      tags: [],
      networks: {
        v4: [{ type: 'public', ip_address: '9.9.9.9' }],
      },
    },
  ],
}

describe('listOpenClawDroplets', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns mapped droplets from the DO API', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockDropletResponse),
    }))

    const result = await listOpenClawDroplets('test-token')

    expect(result).toEqual([
      { id: 123, name: 'open-claw-hal', ip: '1.2.3.4' },
      { id: 456, name: 'open-claw-marvin', ip: '5.6.7.8' },
    ])
  })

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    }))

    await expect(listOpenClawDroplets('bad-token')).rejects.toThrow(
      'Digital Ocean API error: 401 Unauthorized'
    )
  })
})
