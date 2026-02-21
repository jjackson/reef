import { NextResponse } from 'next/server'
import { resolveInstance } from '@/lib/instances'
import { getHealth } from '@/lib/openclaw'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const instance = await resolveInstance(id)
    if (!instance) return NextResponse.json({ error: 'Instance not found' }, { status: 404 })
    const health = await getHealth({ host: instance.ip, privateKey: instance.sshKey })
    return NextResponse.json(health)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
