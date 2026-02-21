import { NextResponse } from 'next/server'
import { resolveInstance } from '@/lib/instances'
import { backupDirectory } from '@/lib/ssh'
import { mkdir } from 'fs/promises'
import path from 'path'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const instance = await resolveInstance(id)
    if (!instance) return NextResponse.json({ error: 'Instance not found' }, { status: 404 })

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupDir = path.join(process.cwd(), 'backups', id)
    await mkdir(backupDir, { recursive: true })
    const localPath = path.join(backupDir, `${timestamp}.tar.gz`)

    await backupDirectory(
      { host: instance.ip, privateKey: instance.sshKey },
      '~/.openclaw',
      localPath
    )
    return NextResponse.json({ path: localPath, timestamp })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
