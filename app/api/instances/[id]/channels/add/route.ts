import { NextResponse } from 'next/server'
import { resolveInstance } from '@/lib/instances'
import { addChannel } from '@/lib/openclaw'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const instance = await resolveInstance(id)
    if (!instance) return NextResponse.json({ error: 'Instance not found' }, { status: 404 })

    const body = await req.json()
    const { channel, token, accountId } = body as { channel?: string; token?: string; accountId?: string }
    if (!channel) return NextResponse.json({ error: 'channel is required' }, { status: 400 })
    if (!token) return NextResponse.json({ error: 'token is required' }, { status: 400 })

    const result = await addChannel(
      { host: instance.ip, privateKey: instance.sshKey },
      channel,
      token,
      accountId
    )
    return NextResponse.json(result, { status: result.success ? 200 : 500 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
