import type {
  CloudProvider,
  CloudInstance,
  CloudRegion,
  CloudSize,
  CloudSshKey,
  CreateInstanceOptions,
} from './types'

const DO_API = 'https://api.digitalocean.com/v2'

export class DigitalOceanProvider implements CloudProvider {
  readonly type = 'digitalocean'
  private readonly apiToken: string
  private static readonly OPENCLAW_PATTERN = /openclaw|open-claw/i

  constructor(apiToken: string) {
    this.apiToken = apiToken
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json',
    }
  }

  async listInstances(): Promise<CloudInstance[]> {
    const res = await fetch(`${DO_API}/droplets?per_page=200`, {
      headers: this.headers(),
    })

    if (!res.ok) {
      throw new Error(`Digital Ocean API error: ${res.status} ${res.statusText}`)
    }

    const data = await res.json()

    return data.droplets
      .filter(
        (d: any) =>
          DigitalOceanProvider.OPENCLAW_PATTERN.test(d.name) ||
          d.tags?.includes('openclaw')
      )
      .map((d: any) => ({
        providerId: String(d.id),
        name: d.name,
        ip:
          d.networks.v4.find((n: any) => n.type === 'public')?.ip_address ?? '',
      }))
  }

  async getInstance(providerId: string): Promise<CloudInstance | null> {
    const dropletId = Number(providerId)
    const res = await fetch(`${DO_API}/droplets/${dropletId}`, {
      headers: this.headers(),
    })

    if (!res.ok) {
      if (res.status === 404) return null
      throw new Error(`Digital Ocean API error: ${res.status} ${res.statusText}`)
    }

    const data = await res.json()
    const d = data.droplet
    return {
      providerId: String(d.id),
      name: d.name,
      ip:
        d.networks?.v4?.find((n: any) => n.type === 'public')?.ip_address ?? '',
    }
  }

  async rebootInstance(
    providerId: string
  ): Promise<{ success: boolean; error?: string }> {
    const dropletId = Number(providerId)
    const res = await fetch(`${DO_API}/droplets/${dropletId}/actions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ type: 'reboot' }),
    })

    if (!res.ok) {
      const body = await res.text()
      return { success: false, error: `DO API error: ${res.status} ${body}` }
    }

    return { success: true }
  }

  async listRegions(): Promise<CloudRegion[]> {
    const res = await fetch(`${DO_API}/regions?per_page=200`, {
      headers: this.headers(),
    })

    if (!res.ok) {
      throw new Error(`Digital Ocean API error: ${res.status} ${res.statusText}`)
    }

    const data = await res.json()
    return data.regions
      .filter((r: any) => r.available)
      .map((r: any) => ({ slug: r.slug, name: r.name }))
  }

  async listSizes(): Promise<CloudSize[]> {
    const res = await fetch(`${DO_API}/sizes?per_page=200`, {
      headers: this.headers(),
    })

    if (!res.ok) {
      throw new Error(`Digital Ocean API error: ${res.status} ${res.statusText}`)
    }

    const data = await res.json()
    return data.sizes
      .filter((s: any) => s.available)
      .map((s: any) => {
        const memGB = Math.round(s.memory / 1024)
        return {
          slug: s.slug,
          label: `${s.vcpus} vCPU, ${memGB}GB RAM, ${s.disk}GB SSD — $${s.price_monthly}/mo`,
          memory: s.memory,
          vcpus: s.vcpus,
          disk: s.disk,
          priceMonthly: s.price_monthly,
          regions: s.regions,
        }
      })
  }

  async listSshKeys(): Promise<CloudSshKey[]> {
    const res = await fetch(`${DO_API}/account/keys?per_page=200`, {
      headers: this.headers(),
    })

    if (!res.ok) {
      throw new Error(`Digital Ocean API error: ${res.status} ${res.statusText}`)
    }

    const data = await res.json()
    return data.ssh_keys.map((k: any) => ({
      id: k.id,
      name: k.name,
      publicKey: k.public_key,
      fingerprint: k.fingerprint,
    }))
  }

  async addSshKey(name: string, publicKey: string): Promise<CloudSshKey> {
    const res = await fetch(`${DO_API}/account/keys`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ name, public_key: publicKey }),
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Failed to add SSH key: ${res.status} ${body}`)
    }

    const data = await res.json()
    const k = data.ssh_key
    return {
      id: k.id,
      name: k.name,
      publicKey: k.public_key,
      fingerprint: k.fingerprint,
    }
  }

  async createInstance(opts: CreateInstanceOptions): Promise<CloudInstance> {
    const res = await fetch(`${DO_API}/droplets`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        name: opts.name,
        region: opts.region,
        size: opts.size,
        image: opts.image,
        ssh_keys: opts.sshKeyIds,
        tags: opts.tags,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Failed to create droplet: ${res.status} ${body}`)
    }

    const data = await res.json()
    const d = data.droplet
    return {
      providerId: String(d.id),
      name: d.name,
      ip:
        d.networks?.v4?.find((n: any) => n.type === 'public')?.ip_address ?? '',
    }
  }
}
