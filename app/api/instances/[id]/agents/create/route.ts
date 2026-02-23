import { NextResponse } from 'next/server'
import { resolveInstance } from '@/lib/instances'
import { createAgent } from '@/lib/openclaw'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const instance = await resolveInstance(id)
    if (!instance) return NextResponse.json({ error: 'Instance not found' }, { status: 404 })

    const body = await req.json()
    const { name, model } = body as { name?: string; model?: string }
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

    const result = await createAgent(
      { host: instance.ip, privateKey: instance.sshKey },
      name,
      model ? { model } : undefined
    )
    return NextResponse.json(result, { status: result.success ? 200 : 500 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
