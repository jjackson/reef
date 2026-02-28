import { NextResponse } from 'next/server'
import { resolveInstance } from '@/lib/instances'
import { runCommand } from '@/lib/ssh'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const instance = await resolveInstance(id)
    if (!instance) return NextResponse.json({ error: 'Instance not found' }, { status: 404 })

    const config = { host: instance.ip, privateKey: instance.sshKey }

    // List reef-owned sessions, then kill each one
    const listResult = await runCommand(config, "tmux list-sessions -F '#{session_name}' 2>/dev/null || true")
    const reefSessions = listResult.stdout
      .split('\n')
      .map(s => s.trim())
      .filter(s => /^reef-\d+$/.test(s))

    for (const session of reefSessions) {
      await runCommand(config, `tmux kill-session -t ${session}`)
    }

    return NextResponse.json({ success: true, killed: reefSessions.length })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
