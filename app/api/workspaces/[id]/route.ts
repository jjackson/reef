import { NextResponse } from 'next/server'
import { moveInstance, deleteWorkspace } from '@/lib/workspaces'
import { loadSettings, writeSettings } from '@/lib/settings'

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const body = await request.json()
    const settings = loadSettings()
    const ws = settings.workspaces[id]
    if (!ws) return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    if (body.label) ws.label = body.label
    if (body.addInstance) moveInstance(body.addInstance, id)
    else writeSettings(settings)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    deleteWorkspace(id)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
