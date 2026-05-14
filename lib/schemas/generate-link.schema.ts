import { z } from 'zod'

export const generateLinkSchema = z.object({
  salesforceAccountId: z.string().min(1, 'salesforceAccountId is required'),
  companyId: z.string().min(1, 'companyId is required'),

  companyName: z.string().optional(),
  billingStreet: z.string().optional(),
  billingCity: z.string().optional(),
  billingState: z.string().optional(),
  billingPostalCode: z.string().optional(),
  billingCountry: z.string().optional(),
  primaryContactFirstName: z.string().optional(),
  primaryContactLastName: z.string().optional(),
  primaryContactEmail: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  industry: z.string().optional(),
  industryOther: z.string().optional(),
  numberOfEmployees: z.union([z.number(), z.string()]).optional(),
  userCount: z.union([z.number(), z.string()]).optional(),
  fullUsers: z.union([z.number(), z.string()]).optional(),
  limitedAgents: z.union([z.number(), z.string()]).optional(),
  productsEnabled: z.string().optional(),
  website: z.string().optional(),
  currencyCode: z.string().optional(),
  contractedSeats: z.union([z.number(), z.string()]).optional(),
  dataMigration: z.string().optional(),
  supportType: z.string().optional(),
  engageContractedSeats: z.union([z.number(), z.string()]).optional(),
  primaryLanguage: z.string().optional(),
  salesSegment: z.string().optional(),
})

export type GenerateLinkInput = z.infer<typeof generateLinkSchema>
