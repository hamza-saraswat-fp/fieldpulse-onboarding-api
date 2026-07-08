import { z } from 'zod'
import { logger } from '@/lib/logger'

const log = logger('generate-link-schema')

// Picklist values from the SF field mapping spec (REV-219).
// Required fields fail fast with a clear 400 (see below). The optional
// display/prefill picklists, however, are wrapped in `lenientEnum`: a
// drifting value (e.g. a deactivated Salesforce option) is dropped and
// logged rather than 400ing the whole link, since it never reaches
// FieldPulse and only prefills the wizard.
export const numberOfEmployeesValues = [
  '0',
  '1',
  '2',
  '3-5',
  '6-10',
  '11-20',
  '21-30',
  '31-50',
  '51+',
] as const

export const supportTypeValues = [
  'Standard',
  'Premium',
  'Growth',
  'Fintech Premium',
] as const

export const primaryLanguageValues = ['English', 'Spanish'] as const

export const salesSegmentValues = ['Scale', 'Velocity'] as const

export const currencyCodeValues = ['AUD', 'CAD', 'NZD', 'USD'] as const

/**
 * Wrap a Zod schema as optional, treating `null` and `""` as "not provided".
 * Salesforce serializes unset columns / picklists as `null`; a natural
 * SF-side client emits those nulls verbatim. Without this preprocessing,
 * Zod's `.optional()` rejects `null` because it only tolerates the key
 * being absent — not present-but-null.
 */
const opt = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(
    (val) => (val === '' || val === null ? undefined : val),
    schema.optional()
  )

/**
 * Optional picklist enum that tolerates Salesforce picklist drift.
 * Known values pass through; `null` / `""` / absent become "not provided";
 * any unrecognized non-empty value is dropped (and logged) instead of
 * 400ing the whole request. These are optional display / prefill fields —
 * a drifting one must not block link generation. Required fields stay
 * strict (a plain `z.string().min(1)`), so genuinely invalid payloads
 * still fail fast.
 */
const lenientEnum = <T extends readonly [string, ...string[]]>(
  values: T,
  field: string
) =>
  z.preprocess((val) => {
    if (val === '' || val === null || val === undefined) return undefined
    if ((values as readonly unknown[]).includes(val)) return val
    log.warn(`dropping unrecognized ${field}:`, JSON.stringify({ received: val }))
    return undefined
  }, z.enum(values).optional())

export const generateLinkSchema = z.object({
  // Required
  salesforceAccountId: z.string().min(1, 'salesforceAccountId is required'),
  companyId: z.string().min(1, 'companyId is required'),

  // Account information
  companyName: opt(z.string()),
  primaryContactFirstName: opt(z.string()),
  primaryContactLastName: opt(z.string()),
  primaryContactEmail: opt(z.string().email()),
  phone: opt(z.string()),
  // FP backend SSO token. Used at Complete-Setup time to authenticate against
  // POST /v2.5/authorize and obtain a JWT for downstream backend calls.
  // Treated as an opaque string — no format validation.
  founderUserSsoId: opt(z.string()),

  // Contractual details
  userCount: opt(z.number()),
  fullUsers: opt(z.number()),
  dataMigration: opt(z.boolean()),
  contractedSeats: opt(z.number()),
  supportType: lenientEnum(supportTypeValues, 'supportType'),
  limitedAgents: opt(z.number()),
  engageContractedSeats: opt(z.number()),

  // Firmographic data
  numberOfEmployees: lenientEnum(numberOfEmployeesValues, 'numberOfEmployees'),
  primaryLanguage: lenientEnum(primaryLanguageValues, 'primaryLanguage'),
  industry: opt(z.string()),
  industryOther: opt(z.string()),
  website: opt(z.string()),
  salesSegment: lenientEnum(salesSegmentValues, 'salesSegment'),

  // Pipeline / billing
  currencyCode: lenientEnum(currencyCodeValues, 'currencyCode'),
  billingStreet: opt(z.string()),
  billingCity: opt(z.string()),
  billingState: opt(z.string()),
  billingPostalCode: opt(z.string()),
  billingCountry: opt(z.string()),

  // Products enabled (flat booleans per Section 3.6 of the integration spec)
  customerCommunicationEnabled: opt(z.boolean()),
  quickbooksOnlineEnabled: opt(z.boolean()),
  quickbooksDesktopEnabled: opt(z.boolean()),
  fpPaymentsEnabled: opt(z.boolean()),
  fpPaymentsProvider: opt(z.string()),
  customFormsEnabled: opt(z.boolean()),
  engageEnabled: opt(z.boolean()),

  // Legacy: original semicolon-delimited products string. Kept for
  // backwards compat. Flat booleans above take precedence when both are
  // provided. Remove once no callers are sending the old shape.
  productsEnabled: opt(z.string()),
})

export type GenerateLinkInput = z.infer<typeof generateLinkSchema>
