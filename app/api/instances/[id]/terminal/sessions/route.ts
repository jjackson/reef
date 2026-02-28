import { NextResponse } from 'next/server'
import { resolveInstance } from '@/lib/instances'
import { runCommand } from '@/lib/ssh'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const instance = await resolveInstance(id)
    if (!instance) return NextResponse.json({ error: 'Instance not found' }, { status: 404 })

    const config = { host: instance.ip, privateKey: instance.sshKey }
    const result = await runCommand(config, "tmux list-sessions -F '#{session_name}' 2>/dev/null || true")

    const sessions = result.stdout
      .split('\n')
      .map(s => s.trim())
      .filter(s => /^reef-\d+$/.test(s))
      .map(name => ({ name }))

    return NextResponse.json({ sessions })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
