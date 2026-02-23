import { NextResponse } from 'next/server'
import { resolveInstance } from '@/lib/instances'
import { bindChannel } from '@/lib/openclaw'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; agentId: string }> }
) {
  const { id, agentId } = await params
  try {
    const instance = await resolveInstance(id)
    if (!instance) return NextResponse.json({ error: 'Instance not found' }, { status: 404 })

    const body = await req.json()
    const { channel, accountId } = body as { channel?: string; accountId?: string }
    if (!channel) return NextResponse.json({ error: 'channel is required' }, { status: 400 })

    const result = await bindChannel(
      { host: instance.ip, privateKey: instance.sshKey },
      agentId,
      channel,
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
