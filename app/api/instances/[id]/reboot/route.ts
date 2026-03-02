import { NextResponse } from 'next/server'
import { getInstance, getAccountToken } from '@/lib/instances'
import { createProvider } from '@/lib/providers'
import { loadSettings } from '@/lib/settings'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const instance = await getInstance(id)
    if (!instance) return NextResponse.json({ error: 'Instance not found' }, { status: 404 })
    const token = await getAccountToken(instance.accountId)
    const settings = loadSettings()
    const accountConfig = settings.accounts[instance.accountId]
    const provider = createProvider(accountConfig?.provider, token)
    const result = await provider.rebootInstance(instance.providerId)
    return NextResponse.json(result, { status: result.success ? 200 : 500 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
