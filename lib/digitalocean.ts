export interface Droplet {
  id: number
  name: string
  ip: string
}

const OPENCLAW_PATTERN = /openclaw|open-claw/i

/**
 * Lists all Digital Ocean droplets that match OpenClaw naming.
 * Finds droplets with "openclaw" or "open-claw" in their name,
 * OR tagged with "openclaw".
 */
export async function listOpenClawDroplets(apiToken: string): Promise<Droplet[]> {
  const res = await fetch(
    'https://api.digitalocean.com/v2/droplets?per_page=200',
    {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
    }
  )

  if (!res.ok) {
    throw new Error(`Digital Ocean API error: ${res.status} ${res.statusText}`)
  }

  const data = await res.json()

  return data.droplets
    .filter((d: any) =>
      OPENCLAW_PATTERN.test(d.name) ||
      d.tags?.includes('openclaw')
    )
    .map((d: any) => ({
      id: d.id,
      name: d.name,
      ip: d.networks.v4.find((n: any) => n.type === 'public')?.ip_address ?? '',
    }))
}
