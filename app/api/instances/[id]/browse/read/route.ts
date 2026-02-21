import { NextResponse } from 'next/server'
import { resolveInstance } from '@/lib/instances'
import { runCommand } from '@/lib/ssh'

const MAX_FILE_SIZE = 1_000_000 // 1MB

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

  // Safety: only allow paths within ~/.openclaw/
  if (!remotePath.startsWith('~/.openclaw/') && remotePath !== '~/.openclaw') {
    return NextResponse.json({ error: 'path must be within ~/.openclaw/' }, { status: 400 })
  }

  try {
    const instance = await resolveInstance(id)
    if (!instance) return NextResponse.json({ error: 'Instance not found' }, { status: 404 })

    const sshConfig = { host: instance.ip, privateKey: instance.sshKey }
    const safePath = remotePath.replace(/^~/, '$HOME')

    // Check file size first
    const sizeResult = await runCommand(sshConfig, `stat -c%s "${safePath}" 2>/dev/null`)
    if (sizeResult.code !== 0) {
      return NextResponse.json({ error: 'File not found or not accessible' }, { status: 404 })
    }

    const size = parseInt(sizeResult.stdout.trim(), 10)
    if (isNaN(size)) {
      return NextResponse.json({ error: 'Could not determine file size' }, { status: 500 })
    }

    if (size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large (${size} bytes). Maximum is ${MAX_FILE_SIZE} bytes.` },
        { status: 413 }
      )
    }

    // Read file content
    const catResult = await runCommand(sshConfig, `cat "${safePath}"`)
    if (catResult.code !== 0) {
      return NextResponse.json(
        { error: catResult.stderr || 'Failed to read file' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      content: catResult.stdout,
      path: remotePath,
      size,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
