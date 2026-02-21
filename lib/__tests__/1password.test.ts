import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockResolve = vi.fn()

vi.mock('@1password/sdk', () => ({
  createClient: vi.fn().mockResolvedValue({
    secrets: { resolve: mockResolve },
  }),
}))

const { getSecret } = await import('../1password')

describe('getSecret', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.OP_SERVICE_ACCOUNT_TOKEN = 'test-token'
  })

  it('resolves a secret by op:// ref', async () => {
    mockResolve.mockResolvedValue('ssh-private-key-value')

    const result = await getSecret('op://AI-Agents/hal - SSH Private Key/private key')

    expect(result).toBe('ssh-private-key-value')
    expect(mockResolve).toHaveBeenCalledWith(
      'op://AI-Agents/hal - SSH Private Key/private key'
    )
  })

  it('propagates errors from the SDK', async () => {
    mockResolve.mockRejectedValue(new Error('item not found'))

    await expect(
      getSecret('op://AI-Agents/nonexistent/credential')
    ).rejects.toThrow('item not found')
  })
})
