import { NextResponse } from 'next/server'
import { resolveInstance } from '@/lib/instances'
import { addChannel } from '@/lib/openclaw'
import { saveChannelToken } from '@/lib/1password'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const instance = await resolveInstance(id)
    if (!instance) return NextResponse.json({ error: 'Instance not found' }, { status: 404 })

    const body = await req.json()
    const { channel, token, accountId, saveToOp } = body as {
      channel?: string; token?: string; accountId?: string; saveToOp?: boolean
    }
    if (!channel) return NextResponse.json({ error: 'channel is required' }, { status: 400 })
    if (!token) return NextResponse.json({ error: 'token is required' }, { status: 400 })

    const result = await addChannel(
      { host: instance.ip, privateKey: instance.sshKey },
      channel,
      token,
      accountId
    )

    // Save token to 1Password if requested
    let opItem: { id: string; title: string } | undefined
    if (saveToOp && accountId) {
      try {
        opItem = await saveChannelToken(channel, accountId, token)
      } catch (opErr) {
        // Don't fail the whole request if 1Password save fails
        return NextResponse.json({
          ...result,
          opWarning: `Channel added but failed to save to 1Password: ${opErr instanceof Error ? opErr.message : 'Unknown error'}`,
        }, { status: result.success ? 200 : 500 })
      }
    }

    return NextResponse.json(
      { ...result, ...(opItem ? { opItem: opItem.title } : {}) },
      { status: result.success ? 200 : 500 }
    )
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
