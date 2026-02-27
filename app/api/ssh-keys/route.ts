import { NextResponse } from 'next/server'
import { listSshKeyItems } from '@/lib/1password'

export async function GET() {
  try {
    const keys = await listSshKeyItems()
    return NextResponse.json({ keys })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
