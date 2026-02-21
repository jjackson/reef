import { NextResponse } from 'next/server'
import { resolveInstance } from '@/lib/instances'
import { migrateAgent } from '@/lib/openclaw'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; agentId: string }> }
) {
  const { id, agentId } = await params
  try {
    const { destinationId, deleteSource } = await req.json()
    if (!destinationId) {
      return NextResponse.json({ error: 'destinationId is required' }, { status: 400 })
    }

    const source = await resolveInstance(id)
    if (!source) return NextResponse.json({ error: 'Source instance not found' }, { status: 404 })

    const dest = await resolveInstance(destinationId)
    if (!dest) return NextResponse.json({ error: 'Destination instance not found' }, { status: 404 })

    const result = await migrateAgent(
      { host: source.ip, privateKey: source.sshKey },
      { host: dest.ip, privateKey: dest.sshKey },
      agentId,
      deleteSource ?? false
    )

    if (!result.success) {
      return NextResponse.json({ error: result.error, method: result.method }, { status: 500 })
    }
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
