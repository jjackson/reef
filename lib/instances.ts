import { readFile } from 'fs/promises'
import { loadEnv } from './env'
import { getSecret } from './1password'
import { listOpenClawDroplets } from './digitalocean'
import { getBotName } from './mapping'

export interface Instance {
  id: string       // DO droplet name (used as stable ID)
  label: string    // Display name (full droplet name)
  ip: string
  dropletId: number
  sshKeyRef: string // op:// reference — not the key itself
}

export interface ResolvedInstance extends Instance {
  sshKey: string   // Actual private key value
}

/**
 * Resolves the SSH private key from one of three sources (in priority order):
 *   1. SSH_PRIVATE_KEY env var (raw key contents)
 *   2. SSH_KEY_PATH env var (path to key file, e.g. ~/.ssh/id_rsa)
 *   3. 1Password op:// reference (requires OP_SERVICE_ACCOUNT_TOKEN)
 */
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

export async function listInstances(): Promise<Instance[]> {
  loadEnv()
  // Use DO_API_TOKEN directly if set, otherwise resolve via 1Password
  const doToken = process.env.DO_API_TOKEN
    || await getSecret(process.env.DO_API_TOKEN_OP_REF!)
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
      }
    })
    .filter((i): i is Instance => i !== null)
}

export async function getInstance(id: string): Promise<Instance | null> {
  const instances = await listInstances()
  return instances.find((i) => i.id === id) ?? null
}

/**
 * Like getInstance, but also fetches the SSH private key.
 * Tries SSH_PRIVATE_KEY env, then SSH_KEY_PATH file, then 1Password.
 */
export async function resolveInstance(id: string): Promise<ResolvedInstance | null> {
  const instance = await getInstance(id)
  if (!instance) return null
  try {
    const sshKey = await resolveSSHKey(instance.sshKeyRef)
    return { ...instance, sshKey }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('secret reference') || msg.includes('no item matched')) {
      throw new Error(`No SSH key found for ${instance.label} in 1Password. Expected item: "${instance.sshKeyRef.split('/')[2]}" in the AI-Agents vault.`)
    }
    throw err
  }
}
