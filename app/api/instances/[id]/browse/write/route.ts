import { NextResponse } from 'next/server'
import { resolveInstance } from '@/lib/instances'
import { writeRemoteFile } from '@/lib/openclaw'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const { path: remotePath, content } = await req.json()

    if (!remotePath || typeof remotePath !== 'string') {
      return NextResponse.json({ error: 'path is required' }, { status: 400 })
    }
    if (typeof content !== 'string') {
      return NextResponse.json({ error: 'content is required' }, { status: 400 })
    }
    if (!remotePath.startsWith('~/.openclaw/')) {
      return NextResponse.json({ error: 'path must be within ~/.openclaw/' }, { status: 400 })
    }
    if (remotePath.includes('..')) {
      return NextResponse.json({ error: 'path must not contain ..' }, { status: 400 })
    }

    const instance = await resolveInstance(id)
    if (!instance) return NextResponse.json({ error: 'Instance not found' }, { status: 404 })
    await writeRemoteFile({ host: instance.ip, privateKey: instance.sshKey }, remotePath, content)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
