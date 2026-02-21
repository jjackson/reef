import { NextResponse } from 'next/server'
import { resolveInstance } from '@/lib/instances'
import { listAgents } from '@/lib/openclaw'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const instance = await resolveInstance(id)
    if (!instance) return NextResponse.json({ error: 'Instance not found' }, { status: 404 })
    const agents = await listAgents({ host: instance.ip, privateKey: instance.sshKey })
    return NextResponse.json(agents)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
