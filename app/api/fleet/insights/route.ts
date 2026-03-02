import { NextRequest, NextResponse } from 'next/server'
import { getFleetKnowledge } from '@/lib/insights'

export async function GET(req: NextRequest) {
  try {
    const workspace = req.nextUrl.searchParams.get('workspace') || undefined
    const fleet = await getFleetKnowledge(workspace)
    return NextResponse.json(fleet)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch fleet insights' },
      { status: 500 }
    )
  }
}
