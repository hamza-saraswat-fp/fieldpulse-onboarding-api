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

export const generateLinkSchema = z.object({
  // Required
  salesforceAccountId: z.string().min(1, 'salesforceAccountId is required'),
  companyId: z.string().min(1, 'companyId is required'),

  // Account information
  companyName: z.string().optional(),
  primaryContactFirstName: z.string().optional(),
  primaryContactLastName: z.string().optional(),
  primaryContactEmail: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),

  // Contractual details
  userCount: z.number().optional(),
  fullUsers: z.number().optional(),
  dataMigration: z.boolean().optional(),
  contractedSeats: z.number().optional(),
  supportType: z.enum(supportTypeValues).optional(),
  limitedAgents: z.number().optional(),
  engageContractedSeats: z.number().optional(),

  // Firmographic data
  numberOfEmployees: z.enum(numberOfEmployeesValues).optional(),
  primaryLanguage: z.enum(primaryLanguageValues).optional(),
  industry: z.string().optional(),
  industryOther: z.string().optional(),
  website: z.string().optional(),
  salesSegment: z.enum(salesSegmentValues).optional(),

  // Pipeline / billing
  currencyCode: z.enum(currencyCodeValues).optional(),
  billingStreet: z.string().optional(),
  billingCity: z.string().optional(),
  billingState: z.string().optional(),
  billingPostalCode: z.string().optional(),
  billingCountry: z.string().optional(),

  // Products enabled (flat booleans per Section 3.6 of the integration spec)
  customerCommunicationEnabled: z.boolean().optional(),
  quickbooksOnlineEnabled: z.boolean().optional(),
  quickbooksDesktopEnabled: z.boolean().optional(),
  fpPaymentsEnabled: z.boolean().optional(),
  fpPaymentsProvider: z.string().optional(),
  customFormsEnabled: z.boolean().optional(),
  engageEnabled: z.boolean().optional(),

  // Legacy: original semicolon-delimited products string. Kept for
  // backwards compat. Flat booleans above take precedence when both are
  // provided. Remove once no callers are sending the old shape.
  productsEnabled: z.string().optional(),
})

export type GenerateLinkInput = z.infer<typeof generateLinkSchema>
