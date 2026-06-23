import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateLinkSchema } from '@/lib/schemas/generate-link.schema'
import {
  transformSalesforceBody,
  deriveCustomFormsEnabled,
} from '@/lib/salesforce/transforms'
import { logger } from '@/lib/logger'

const log = logger('generate-link')

// Spec: onboarding links do not expire. The wizard_sessions migration still
// has expires_at as NOT NULL DEFAULT now() + 14 days, so we write a sentinel
// far-future date on insert and ignore the column on lookup. Cleanup migration
// to drop the constraint is tracked separately.
const NO_EXPIRATION_SENTINEL = '2999-12-31T00:00:00.000Z'

export async function POST(request: Request) {
  const apiKey = process.env.SALESFORCE_INTEGRATION_KEY
  if (!apiKey) {
    log.error('SALESFORCE_INTEGRATION_KEY is not configured')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }

  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const token = authHeader.slice(7)
  if (token !== apiKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = generateLinkSchema.safeParse(body)
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors
    // warn (not info) so this survives getMinLevel() in production logs.
    // Logs only the field names + Zod messages — no payload data, so no PII risk.
    log.warn('Validation failed:', JSON.stringify(fieldErrors))
    return NextResponse.json(
      { error: 'Validation failed', fields: fieldErrors },
      { status: 400 }
    )
  }

  const input = parsed.data
  log.info('Generating link for companyId:', input.companyId)

  const supabase = createAdminClient()

  const { data: existingSession, error: lookupError } = await supabase
    .from('wizard_sessions')
    .select('id, access_token, status')
    .eq('company_id', input.companyId)
    .neq('status', 'expired')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lookupError) {
    log.error('Failed to check for existing session:', lookupError.message)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  if (existingSession) {
    let reuseToken = existingSession.access_token
    if (!reuseToken) {
      // Pre-QA-36 completed session whose token was nulled on first exchange.
      // Refresh the token on the SAME row instead of INSERTing a new session, so we
      // return a working link without re-creating the duplicate-row churn QA-52 is about.
      reuseToken = crypto.randomUUID()
      const { error: refreshError } = await supabase
        .from('wizard_sessions')
        .update({ access_token: reuseToken })
        .eq('id', existingSession.id)
      if (refreshError) {
        log.error('Failed to refresh access_token for existing session:', refreshError.message)
        return NextResponse.json(
          { error: 'Internal server error' },
          { status: 500 }
        )
      }
      log.info('Refreshed null access_token for existing session:', existingSession.id)
    }
    const existingLink = `${appUrl}/setup?token=${reuseToken}`
    log.info('Reusing existing session for companyId:', input.companyId, 'sessionId:', existingSession.id)
    return NextResponse.json(
      {
        error: 'Active session exists',
        existingLink,
        sessionId: existingSession.id,
      },
      { status: 409 }
    )
  }

  const salesforceData = transformSalesforceBody(input as Record<string, unknown>)
  const accessToken = crypto.randomUUID()
  // Prefer the explicit boolean from the new flat-boolean shape; fall back
  // to deriving from the legacy productsEnabled string.
  const customFormsEnabled =
    typeof input.customFormsEnabled === 'boolean'
      ? input.customFormsEnabled
      : deriveCustomFormsEnabled(input.productsEnabled)

  const { data: session, error: insertError } = await supabase
    .from('wizard_sessions')
    .insert({
      company_id: input.companyId,
      access_token: accessToken,
      salesforce_data: salesforceData,
      // Map the Salesforce-provided SSO id into the dedicated column the wizard
      // app reads at Complete Setup (POST /authorize { sso_token_id }). Without
      // this the column stays NULL and Complete Setup throws missing_sso_token_id.
      sso_token_id: input.founderUserSsoId ?? null,
      custom_forms_enabled: customFormsEnabled,
      status: 'in_progress',
      expires_at: NO_EXPIRATION_SENTINEL,
    })
    .select('id')
    .single()

  if (insertError) {
    log.error('Failed to create wizard session:', insertError.message)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }

  const onboardingLink = `${appUrl}/setup?token=${accessToken}`
  log.info('Link generated for companyId:', input.companyId, '→', session.id)

  return NextResponse.json(
    { onboardingLink, sessionId: session.id },
    { status: 201 }
  )
}
