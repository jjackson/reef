import { getSecret } from './1password'
import { listOpenClawDroplets } from './digitalocean'
import { getBotName } from './mapping'

export interface Instance {
  id: string       // DO droplet name (used as stable ID)
  label: string    // Bot name from 1Password mapping
  ip: string
  dropletId: number
  sshKeyRef: string // op:// reference — not the key itself
}

export interface ResolvedInstance extends Instance {
  sshKey: string   // Actual private key value, fetched from 1Password
}

export async function listInstances(): Promise<Instance[]> {
  const doToken = await getSecret(process.env.DO_API_TOKEN_OP_REF!)
  const droplets = await listOpenClawDroplets(doToken)

  return droplets
    .map((droplet): Instance | null => {
      const botName = getBotName(droplet.name)
      if (!botName) {
        console.warn(`[reef] No name mapping for droplet: ${droplet.name} — add it to config/name-map.json`)
        return null
      }
      return {
        id: droplet.name,
        label: botName,
        ip: droplet.ip,
        dropletId: droplet.id,
        sshKeyRef: `op://AI-Agents/${botName} - SSH Private Key/private key`,
      }
    })
    .filter((i): i is Instance => i !== null)
}

export async function getInstance(id: string): Promise<Instance | null> {
  const instances = await listInstances()
  return instances.find((i) => i.id === id) ?? null
}

/**
 * Like getInstance, but also fetches the SSH private key from 1Password.
 * Call this in API routes that need to SSH into the machine.
 */
export async function resolveInstance(id: string): Promise<ResolvedInstance | null> {
  const instance = await getInstance(id)
  if (!instance) return null
  const sshKey = await getSecret(instance.sshKeyRef)
  return { ...instance, sshKey }
}
