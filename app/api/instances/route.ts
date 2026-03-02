import { NextResponse } from 'next/server'
import { listInstances } from '@/lib/instances'
import { getWorkspaces } from '@/lib/workspaces'

export async function GET(request: Request) {
  try {
    const instances = await listInstances()
    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get('workspace')

    if (workspaceId) {
      const ws = getWorkspaces().find(w => w.id === workspaceId)
      if (!ws) return NextResponse.json({ error: `Workspace not found: ${workspaceId}` }, { status: 404 })
      return NextResponse.json(instances.filter(i => ws.instances.includes(i.id)))
    }

    return NextResponse.json(instances)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
