import { NextResponse } from 'next/server'
import { listInstances } from '@/lib/instances'

export async function GET() {
  try {
    const instances = await listInstances()
    return NextResponse.json(instances)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
