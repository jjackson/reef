import { NextRequest, NextResponse } from 'next/server'
import { getFleetKnowledge } from '@/lib/insights'
import { loadSettings } from '@/lib/settings'

export async function GET(req: NextRequest) {
  try {
    const workspace = req.nextUrl.searchParams.get('workspace') || undefined

    if (workspace) {
      const settings = loadSettings()
      if (!settings.workspaces[workspace]) {
        return NextResponse.json(
          { error: `Workspace not found: ${workspace}` },
          { status: 404 }
        )
      }
    }

    const fleet = await getFleetKnowledge(workspace)
    return NextResponse.json(fleet)
  } catch (err) {
    console.error('[fleet/insights]', err)
    return NextResponse.json(
      { error: 'Failed to fetch fleet insights' },
      { status: 500 }
    )
  }
}
