import { NextResponse } from 'next/server'
import { resolveInstance } from '@/lib/instances'
import { runCommand } from '@/lib/ssh'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  let body: { path?: string; content?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { path: remotePath, content } = body

  if (!remotePath || content === undefined) {
    return NextResponse.json(
      { error: 'path and content fields are required' },
      { status: 400 }
    )
  }

  // Safety: only allow paths within ~/.openclaw/
  if (!remotePath.startsWith('~/.openclaw/') && remotePath !== '~/.openclaw') {
    return NextResponse.json({ error: 'path must be within ~/.openclaw/' }, { status: 400 })
  }

  try {
    const instance = await resolveInstance(id)
    if (!instance) return NextResponse.json({ error: 'Instance not found' }, { status: 404 })

    const sshConfig = { host: instance.ip, privateKey: instance.sshKey }
    const safePath = remotePath.replace(/^~/, '$HOME')

    // Write file content using base64 encoding to avoid any shell escaping
    // issues with quotes, backticks, dollar signs, etc.
    // We use printf to avoid 'echo' appending a trailing newline to the b64 data.
    const b64 = Buffer.from(content, 'utf-8').toString('base64')
    const writeResult = await runCommand(
      sshConfig,
      `printf '%s' '${b64}' | base64 -d > "${safePath}"`
    )

    if (writeResult.code !== 0) {
      return NextResponse.json(
        { error: writeResult.stderr || 'Failed to write file' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, path: remotePath })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
