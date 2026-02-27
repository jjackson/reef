import { NextResponse } from 'next/server'
import { resolveInstance } from '@/lib/instances'
import { runCommand } from '@/lib/ssh'

/**
 * Lightweight instance info — reads config files only, no openclaw CLI calls.
 * Returns version and GCP project in ~1 SSH round-trip.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const instance = await resolveInstance(id)
    if (!instance) return NextResponse.json({ error: 'Instance not found' }, { status: 404 })

    const config = { host: instance.ip, privateKey: instance.sshKey }
    const result = await runCommand(config, [
      // Version from openclaw package.json
      'cat /usr/lib/node_modules/openclaw/package.json 2>/dev/null | grep \'"version"\' | head -1 | sed \'s/.*"version".*"\\(.*\\)".*/\\1/\'',
      'echo "---"',
      // GCP project: try dedicated file first, then gcloud config
      '(cat /root/.config/gogcli/gcp-project 2>/dev/null || grep "^project" /root/.config/gcloud/configurations/config_default 2>/dev/null | sed "s/project = //" || echo "")',
    ].join('; '))

    const parts = result.stdout.split('---').map(s => s.trim())
    return NextResponse.json({
      version: parts[0] || '',
      gcpProject: parts[1] || '',
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
