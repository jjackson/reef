import { NextResponse } from 'next/server'
import { resolveInstance } from '@/lib/instances'
import { runCommand } from '@/lib/ssh'
import { INSTALL_SCRIPT } from '@/lib/install-openclaw'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const instance = await resolveInstance(id)
    if (!instance) return NextResponse.json({ error: 'Instance not found' }, { status: 404 })

    const config = { host: instance.ip, privateKey: instance.sshKey }

    // Write script to /tmp via heredoc
    const writeResult = await runCommand(
      config,
      `cat > /tmp/reef-install-openclaw.sh << 'REEF_SCRIPT_EOF'\n${INSTALL_SCRIPT}\nREEF_SCRIPT_EOF`
    )
    if (writeResult.code !== 0) {
      return NextResponse.json({ success: false, error: `Failed to upload script: ${writeResult.stderr}` }, { status: 500 })
    }

    await runCommand(config, 'chmod +x /tmp/reef-install-openclaw.sh')

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
