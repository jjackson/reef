import { NextResponse } from 'next/server'
import { getAccountToken } from '@/lib/instances'
import { createProvider } from '@/lib/providers'
import { loadSettings } from '@/lib/settings'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('account') || 'default'
    const token = await getAccountToken(accountId)
    const settings = loadSettings()
    const accountConfig = settings.accounts[accountId]
    const provider = createProvider(accountConfig?.provider, token)
    const regions = await provider.listRegions()
    return NextResponse.json({ regions })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
