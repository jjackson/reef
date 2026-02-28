import { createClient, ItemCategory, ItemFieldType } from '@1password/sdk'

// Module-level singleton — reused across requests in the same Node process.
// In Vercel serverless, each cold start creates a new client (acceptable).
let clientPromise: ReturnType<typeof createClient> | null = null

function getClient() {
  if (!clientPromise) {
    clientPromise = createClient({
      auth: process.env.OP_SERVICE_ACCOUNT_TOKEN!,
      integrationName: 'reef',
      integrationVersion: '1.0.0',
    })
  }
  return clientPromise
}

/**
 * Fetch a secret from 1Password by op:// reference.
 * Example ref: "op://AI-Agents/hal - SSH Private Key/private key"
 *
 * 1Password item naming convention: "<bot-name> - SSH Private Key"
 * The field name inside the item should be "private key".
 */
export async function getSecret(ref: string): Promise<string> {
  const client = await getClient()
  return client.secrets.resolve(ref)
}

const VAULT_NAME = 'AI-Agents'

async function getVaultId(): Promise<string> {
  const client = await getClient()
  const vaults = await client.vaults.list()
  const vault = vaults.find(v => v.title === VAULT_NAME)
  if (!vault) throw new Error(`1Password vault "${VAULT_NAME}" not found`)
  return vault.id
}

export async function listSshKeyItems(): Promise<{ id: string; title: string }[]> {
  const client = await getClient()
  const vaultId = await getVaultId()
  const items = await client.items.list(vaultId)
  return items
    .filter(i => i.category === ItemCategory.SshKey)
    .map(i => ({ id: i.id, title: i.title }))
}

export async function saveChannelToken(
  channelType: string,
  accountId: string,
  token: string
): Promise<{ id: string; title: string }> {
  const client = await getClient()
  const vaultId = await getVaultId()
  const title = `${accountId} - ${channelType} Bot Token`

  // Delete existing items with the same title to avoid duplicates
  const existing = await client.items.list(vaultId)
  for (const item of existing) {
    if (item.title === title) {
      await client.items.delete(vaultId, item.id)
    }
  }

  const item = await client.items.create({
    category: ItemCategory.ApiCredentials,
    vaultId,
    title,
    fields: [{
      id: 'credential',
      title: 'credential',
      value: token,
      fieldType: ItemFieldType.Concealed,
    }],
  })
  return { id: item.id, title: item.title }
}

export async function createSshKeyItem(name: string, privateKey: string): Promise<{ id: string; title: string }> {
  const client = await getClient()
  const vaultId = await getVaultId()
  const title = `${name} - SSH Key`

  // Delete existing items with the same title to avoid duplicates
  const existing = await client.items.list(vaultId)
  for (const item of existing) {
    if (item.title === title) {
      await client.items.delete(vaultId, item.id)
    }
  }

  const item = await client.items.create({
    category: ItemCategory.SshKey,
    vaultId,
    title,
    fields: [{
      id: 'private_key',
      title: 'private key',
      value: privateKey,
      fieldType: ItemFieldType.Concealed,
    }],
  })
  return { id: item.id, title: item.title }
}
