import { NextResponse } from 'next/server'
import { resolveInstance } from '@/lib/instances'
import { sendChatMessage } from '@/lib/openclaw'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; agentId: string }> }
) {
  const { id, agentId } = await params
  try {
    const { message } = await req.json()
    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'message is required' }, { status: 400 })
    }
    const instance = await resolveInstance(id)
    if (!instance) return NextResponse.json({ error: 'Instance not found' }, { status: 404 })
    const response = await sendChatMessage(
      { host: instance.ip, privateKey: instance.sshKey },
      agentId,
      message
    )
    return NextResponse.json({ response })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
