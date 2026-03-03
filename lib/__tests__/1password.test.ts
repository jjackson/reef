import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockClient } = vi.hoisted(() => ({
  mockClient: {
    vaults: { list: vi.fn() },
    items: { list: vi.fn(), create: vi.fn(), delete: vi.fn() },
  },
}))

vi.mock('@1password/sdk', () => ({
  createClient: vi.fn().mockResolvedValue(mockClient),
  ItemCategory: { ApiCredentials: 'API_CREDENTIAL' },
  ItemFieldType: { Concealed: 'CONCEALED' },
}))

// Must set env before importing
process.env.OP_SERVICE_ACCOUNT_TOKEN = 'test-token'

import { saveApiKey } from '../1password'

describe('saveApiKey', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a 1Password item with the correct title and credential field', async () => {
    mockClient.vaults.list.mockResolvedValue([{ id: 'vault-1', title: 'AI-Agents' }])
    mockClient.items.list.mockResolvedValue([])
    mockClient.items.create.mockResolvedValue({ id: 'item-1', title: 'Hal - Anthropic API Key' })

    const result = await saveApiKey('Hal', 'sk-ant-test-key')

    expect(result.title).toBe('Hal - Anthropic API Key')
    expect(mockClient.items.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Hal - Anthropic API Key',
        fields: [expect.objectContaining({ id: 'credential', value: 'sk-ant-test-key' })],
      })
    )
  })

  it('deletes existing item with same title before creating', async () => {
    mockClient.vaults.list.mockResolvedValue([{ id: 'vault-1', title: 'AI-Agents' }])
    mockClient.items.list.mockResolvedValue([{ id: 'old-item', title: 'Hal - Anthropic API Key' }])
    mockClient.items.create.mockResolvedValue({ id: 'item-2', title: 'Hal - Anthropic API Key' })

    await saveApiKey('Hal', 'sk-ant-new-key')

    expect(mockClient.items.delete).toHaveBeenCalledWith('vault-1', 'old-item')
    expect(mockClient.items.create).toHaveBeenCalledOnce()
  })
})
