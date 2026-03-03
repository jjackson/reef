import { NextRequest } from 'next/server'
import { getFleetKnowledge } from '@/lib/insights'
import { loadSettings } from '@/lib/settings'
import { generateFleetReport } from '@/lib/report-html'

export async function GET(req: NextRequest) {
  try {
    const workspace = req.nextUrl.searchParams.get('workspace') || undefined
    const fleet = await getFleetKnowledge(workspace)

    let workspaceLabel: string | undefined
    if (workspace) {
      const settings = loadSettings()
      workspaceLabel = settings.workspaces[workspace]?.label
    }

    const html = generateFleetReport(fleet, workspaceLabel)
    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate report'
    return new Response(`<h1>Error</h1><p>${message}</p>`, {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }
}
