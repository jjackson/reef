import { NextResponse } from 'next/server'
import { resolveInstance } from '@/lib/instances'
import { readRemoteFile } from '@/lib/openclaw'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const remotePath = searchParams.get('path')

  if (!remotePath) {
    return NextResponse.json({ error: 'path query param required' }, { status: 400 })
  }

  if (!remotePath.startsWith('~/.openclaw/') && remotePath !== '~/.openclaw') {
    return NextResponse.json({ error: 'path must be within ~/.openclaw/' }, { status: 400 })
  }

  try {
    const instance = await resolveInstance(id)
    if (!instance) return NextResponse.json({ error: 'Instance not found' }, { status: 404 })
    const content = await readRemoteFile({ host: instance.ip, privateKey: instance.sshKey }, remotePath)
    return NextResponse.json({ content })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
