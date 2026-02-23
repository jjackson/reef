import { NextResponse } from 'next/server'
import { resolveInstance } from '@/lib/instances'
import { deleteAgent } from '@/lib/openclaw'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; agentId: string }> }
) {
  const { id, agentId } = await params
  try {
    const instance = await resolveInstance(id)
    if (!instance) return NextResponse.json({ error: 'Instance not found' }, { status: 404 })

    const result = await deleteAgent(
      { host: instance.ip, privateKey: instance.sshKey },
      agentId
    )
    return NextResponse.json(result, { status: result.success ? 200 : 500 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
