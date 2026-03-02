import { NextResponse } from 'next/server'
import { getWorkspaces, createWorkspace } from '@/lib/workspaces'

export async function GET() {
  try {
    const workspaces = getWorkspaces()
    return NextResponse.json({ success: true, workspaces })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const { id, label } = await request.json()
    if (!id) return NextResponse.json({ error: 'Missing workspace id' }, { status: 400 })
    createWorkspace(id, label || id)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
