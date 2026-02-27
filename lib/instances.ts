import { readFile } from 'fs/promises'
import { loadEnv } from './env'
import { getSecret } from './1password'
import { listOpenClawDroplets } from './digitalocean'
import { getBotName } from './mapping'
import { getAccounts } from './settings'

export interface Instance {
  id: string       // DO droplet name (used as stable ID)
  label: string    // Display name (full droplet name)
  ip: string
  dropletId: number
  sshKeyRef: string // op:// reference — not the key itself
  accountId: string // which DO account owns this instance
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

  // If no accounts configured, fall back to legacy env var behavior
  if (accounts.length === 0) {
    const doToken = process.env.DO_API_TOKEN
      || await getSecret(process.env.DO_API_TOKEN_OP_REF!)
    return listInstancesForAccount('default', doToken)
  }

  // Fetch instances from all accounts in parallel
  const results = await Promise.all(
    accounts.map(async (account) => {
      try {
        const token = await resolveToken(account.tokenRef)
        return await listInstancesForAccount(account.id, token)
      } catch (err) {
        console.warn(`[reef] Failed to list instances for account "${account.id}": ${err instanceof Error ? err.message : err}`)
        return []
      }
    })
  )

  return results.flat()
}

async function listInstancesForAccount(accountId: string, doToken: string): Promise<Instance[]> {
  const droplets = await listOpenClawDroplets(doToken)

  return droplets
    .map((droplet): Instance | null => {
      const opName = getBotName(droplet.name)
      if (!opName) {
        console.warn(`[reef] Skipping droplet: ${droplet.name} (name starts with __)`)
        return null
      }
      return {
        id: droplet.name,
        label: droplet.name,
        ip: droplet.ip,
        dropletId: droplet.id,
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
