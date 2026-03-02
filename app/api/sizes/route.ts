import { NextResponse } from 'next/server'
import { getAccountToken } from '@/lib/instances'
import { createProvider } from '@/lib/providers'
import { loadSettings } from '@/lib/settings'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const region = searchParams.get('region')
    const accountId = searchParams.get('account') || 'default'
    const token = await getAccountToken(accountId)
    const settings = loadSettings()
    const accountConfig = settings.accounts[accountId]
    const provider = createProvider(accountConfig?.provider, token)
    let sizes = await provider.listSizes()
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
