import { z } from 'zod'

// Picklist values from the SF field mapping spec (REV-219).
// Enums enforce the contract at the boundary so typos / drift fail fast
// with a clear 400 instead of being silently stored.
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

  // Contractual details
  userCount: opt(z.number()),
  fullUsers: opt(z.number()),
  dataMigration: opt(z.boolean()),
  contractedSeats: opt(z.number()),
  supportType: opt(z.enum(supportTypeValues)),
  limitedAgents: opt(z.number()),
  engageContractedSeats: opt(z.number()),

  // Firmographic data
  numberOfEmployees: opt(z.enum(numberOfEmployeesValues)),
  primaryLanguage: opt(z.enum(primaryLanguageValues)),
  industry: opt(z.string()),
  industryOther: opt(z.string()),
  website: opt(z.string()),
  salesSegment: opt(z.enum(salesSegmentValues)),

  // Pipeline / billing
  currencyCode: opt(z.enum(currencyCodeValues)),
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
