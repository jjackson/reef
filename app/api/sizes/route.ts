import { NextResponse } from 'next/server'
import { listSizes } from '@/lib/digitalocean'
import { getAccountToken } from '@/lib/instances'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const region = searchParams.get('region')
    const accountId = searchParams.get('account') || 'default'
    const token = await getAccountToken(accountId)
    let sizes = await listSizes(token)
    if (region) {
      sizes = sizes.filter(s => s.regions.includes(region))
    }
    return NextResponse.json({ sizes })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
