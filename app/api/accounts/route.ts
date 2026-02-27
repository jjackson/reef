import { NextResponse } from 'next/server'
import { getAccounts } from '@/lib/settings'

export async function GET() {
  try {
    const accounts = getAccounts()
    return NextResponse.json({ accounts: accounts.map(a => ({ id: a.id, label: a.label })) })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
