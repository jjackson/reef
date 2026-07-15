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

  private async waitForAction(
    dropletId: number,
    actionId: number,
    timeoutMs = 90_000
  ): Promise<{ success: boolean; error?: string }> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const res = await fetch(
        `${DO_API}/droplets/${dropletId}/actions/${actionId}`,
        { headers: this.headers() }
      )
      if (!res.ok) {
        return { success: false, error: `DO API error polling action: ${res.status}` }
      }
      const data = await res.json()
      const status = data.action?.status
      if (status === 'completed') return { success: true }
      if (status === 'errored') return { success: false, error: 'Power off action errored' }
      await new Promise((r) => setTimeout(r, 3000))
    }
    return { success: false, error: 'Timed out waiting for power off to complete' }
  }

  async powerOffInstance(
    providerId: string
  ): Promise<{ success: boolean; error?: string }> {
    const dropletId = Number(providerId)
    const res = await fetch(`${DO_API}/droplets/${dropletId}/actions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ type: 'power_off' }),
    })

    if (!res.ok) {
      const body = await res.text()
      // Already-off droplets return 422; treat as success
      if (res.status === 422 && /already.*off/i.test(body)) {
        return { success: true }
      }
      return { success: false, error: `DO API error: ${res.status} ${body}` }
    }

    const data = await res.json()
    return this.waitForAction(dropletId, data.action.id)
  }

  async destroyInstance(
    providerId: string
  ): Promise<{ success: boolean; error?: string }> {
    const dropletId = Number(providerId)
    // A 422 means another action (e.g. power off) is still settling — retry briefly
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await fetch(`${DO_API}/droplets/${dropletId}`, {
        method: 'DELETE',
        headers: this.headers(),
      })
      if (res.ok || res.status === 404) return { success: true }
      const body = await res.text()
      if (res.status !== 422) {
        return { success: false, error: `DO API error: ${res.status} ${body}` }
      }
      await new Promise((r) => setTimeout(r, 3000))
    }
    return { success: false, error: 'Droplet busy: destroy still rejected after retries' }
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
