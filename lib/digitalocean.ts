export interface Droplet {
  id: number
  name: string
  ip: string
}

/**
 * Lists all Digital Ocean droplets tagged "openclaw".
 * Tag your droplets in DO with "openclaw" to include them in reef.
 */
export async function listOpenClawDroplets(apiToken: string): Promise<Droplet[]> {
  const res = await fetch(
    'https://api.digitalocean.com/v2/droplets?tag_name=openclaw&per_page=100',
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

  return data.droplets.map((d: any) => ({
    id: d.id,
    name: d.name,
    ip: d.networks.v4.find((n: any) => n.type === 'public')?.ip_address ?? '',
  }))
}
