import { NextResponse } from 'next/server'
import { listRegions } from '@/lib/digitalocean'
import { getAccountToken } from '@/lib/instances'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('account') || 'default'
    const token = await getAccountToken(accountId)
    const regions = await listRegions(token)
    return NextResponse.json({ regions })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
