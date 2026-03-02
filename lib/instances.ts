import { readFile } from 'fs/promises'
import { loadEnv } from './env'
import { getSecret } from './1password'
import { createProvider } from './providers'
import { getBotName } from './mapping'
import { getAccounts, loadSettings } from './settings'
import { ensureDefaultWorkspace } from './workspaces'

export interface Instance {
  id: string       // droplet/instance name (used as stable ID)
  label: string    // Display name (full instance name)
  ip: string
  providerId: string // provider-specific ID (e.g. DO droplet ID)
  provider: string   // cloud provider type (e.g. "digitalocean")
  platform: string   // software platform (e.g. "openclaw")
  sshKeyRef: string  // op:// reference — not the key itself
  accountId: string  // which account owns this instance
}

export interface ResolvedInstance extends Instance {
  sshKey: string   // Actual private key value
}

async function resolveSSHKey(opRef: string): Promise<string> {
  if (process.env.SSH_PRIVATE_KEY) {
    return process.env.SSH_PRIVATE_KEY
  }

  if (process.env.SSH_KEY_PATH) {
    const keyPath = process.env.SSH_KEY_PATH.replace(/^~/, process.env.HOME || process.env.USERPROFILE || '')
    return readFile(keyPath, 'utf-8')
  }

  return getSecret(opRef)
}

async function resolveToken(tokenRef: string): Promise<string> {
  if (tokenRef.startsWith('op://')) {
    return getSecret(tokenRef)
  }
  return tokenRef
}

export async function listInstances(): Promise<Instance[]> {
  loadEnv()

  const accounts = getAccounts()
  const settings = loadSettings()

  // If no accounts configured, fall back to legacy env var behavior
  if (accounts.length === 0) {
    const doToken = process.env.DO_API_TOKEN
      || await getSecret(process.env.DO_API_TOKEN_OP_REF!)
    const results = await listInstancesForAccount('default', undefined, doToken)
    ensureDefaultWorkspace(results.map(i => i.id))
    return results
  }

  // Fetch instances from all accounts in parallel
  const results = await Promise.all(
    accounts.map(async (account) => {
      try {
        const token = await resolveToken(account.tokenRef)
        const accountConfig = settings.accounts[account.id]
        return await listInstancesForAccount(account.id, accountConfig?.provider, token)
      } catch (err) {
        console.warn(`[reef] Failed to list instances for account "${account.id}": ${err instanceof Error ? err.message : err}`)
        return []
      }
    })
  )

  const flat = results.flat()
  ensureDefaultWorkspace(flat.map(i => i.id))
  return flat
}

async function listInstancesForAccount(accountId: string, provider: string | undefined, token: string): Promise<Instance[]> {
  const cloudProvider = createProvider(provider, token)
  const cloudInstances = await cloudProvider.listInstances()

  return cloudInstances
    .map((ci): Instance | null => {
      const opName = getBotName(ci.name)
      if (!opName) {
        console.warn(`[reef] Skipping instance: ${ci.name} (name starts with __)`)
        return null
      }
      return {
        id: ci.name,
        label: ci.name,
        ip: ci.ip,
        providerId: ci.providerId,
        provider: provider || 'digitalocean',
        platform: 'openclaw',
        sshKeyRef: `op://AI-Agents/${opName} - SSH Key/private key`,
        accountId,
      }
    })
    .filter((i): i is Instance => i !== null)
}

export async function getInstance(id: string): Promise<Instance | null> {
  const instances = await listInstances()
  return instances.find((i) => i.id === id) ?? null
}

export async function resolveInstance(id: string): Promise<ResolvedInstance | null> {
  const instance = await getInstance(id)
  if (!instance) return null
  try {
    const sshKey = await resolveSSHKey(instance.sshKeyRef)
    return { ...instance, sshKey }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('secret reference') || msg.includes('no item matched')) {
      throw new Error(`No SSH key found for ${instance.label} in 1Password. Expected item: "${instance.sshKeyRef.split('/')[3]}" in the AI-Agents vault.`)
    }
    throw err
  }
}

export async function getAccountToken(accountId: string): Promise<string> {
  loadEnv()
  const accounts = getAccounts()
  const account = accounts.find(a => a.id === accountId)
  if (account) {
    return resolveToken(account.tokenRef)
  }
  return process.env.DO_API_TOKEN || await getSecret(process.env.DO_API_TOKEN_OP_REF!)
}
