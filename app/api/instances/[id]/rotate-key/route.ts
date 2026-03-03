import { NextResponse } from 'next/server'
import { resolveInstance } from '@/lib/instances'
import { rotateKey } from '@/lib/openclaw'
import { getBotName } from '@/lib/mapping'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const instance = await resolveInstance(id)
    if (!instance) return NextResponse.json({ error: 'Instance not found' }, { status: 404 })

    const body = await req.json()
    const { key } = body
    if (!key || typeof key !== 'string') {
      return NextResponse.json({ error: 'Missing required field: key' }, { status: 400 })
    }

    const result = await rotateKey(
      { host: instance.ip, privateKey: instance.sshKey },
      key,
      getBotName(instance.id) || instance.id
    )
    return NextResponse.json(result, { status: result.success ? 200 : 500 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
