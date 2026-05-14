import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'

const log = logger('token-exchange')

export async function POST(request: Request) {
  const { token } = await request.json()

  if (!token) {
    return NextResponse.json(
      { error: 'Token is required' },
      { status: 400 }
    )
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    log.error('Supabase environment variables are not configured')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }

  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/exchange-token`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      }
    )

    const data = await response.json()

    if (!response.ok) {
      log.warn('Token exchange failed:', response.status, data.error)
      return NextResponse.json(data, { status: response.status })
    }

    log.info('Token exchanged for company:', data.company_id)
    return NextResponse.json(data)
  } catch (err) {
    log.error('Token exchange request failed:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
