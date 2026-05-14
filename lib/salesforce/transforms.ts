import { INDUSTRIES } from '@/lib/constants/industries'
import { sanitizeString } from '@/lib/utils/sanitize'

export const companySizeOptions = [
  '1-2',
  '3-5',
  '6-10',
  '11-20',
  '21-30',
  '31-50',
  '51+',
] as const

type CompanySize = (typeof companySizeOptions)[number]

const SIZE_RANGES: [number, number, CompanySize][] = [
  [1, 2, '1-2'],
  [3, 5, '3-5'],
  [6, 10, '6-10'],
  [11, 20, '11-20'],
  [21, 30, '21-30'],
  [31, 50, '31-50'],
]

export function mapEmployeeCountToSize(n: number): CompanySize | undefined {
  if (n < 1) return undefined
  for (const [min, max, size] of SIZE_RANGES) {
    if (n >= min && n <= max) return size
  }
  return '51+'
}

const CURRENCY_MAP: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  CAD: 'C$',
  AUD: 'A$',
  NZD: 'NZ$',
  JPY: '¥',
  INR: '₹',
  BRL: 'R$',
  CHF: 'CHF',
  KRW: '₩',
}

export function mapCurrencyCodeToSymbol(code: string): string {
  return CURRENCY_MAP[code.toUpperCase()] ?? '$'
}

export function matchIndustry(industry?: string, industryOther?: string): string {
  if (industry) {
    const match = INDUSTRIES.find(
      (i) => i.toLowerCase() === industry.toLowerCase()
    )
    if (match) return match
  }
  if (industryOther) {
    const match = INDUSTRIES.find(
      (i) => i.toLowerCase() === industryOther.toLowerCase()
    )
    if (match) return match
  }
  return ''
}

export function deriveCustomFormsEnabled(productsEnabled?: string): boolean {
  if (!productsEnabled) return false
  return productsEnabled
    .split(';')
    .map((s) => s.trim().toLowerCase())
    .includes('custom forms')
}

const SF_PARAM_KEYS = [
  'salesforceAccountId',
  'companyId',
  'companyName',
  'billingStreet',
  'billingCity',
  'billingState',
  'billingPostalCode',
  'billingCountry',
  'primaryContactFirstName',
  'primaryContactLastName',
  'primaryContactEmail',
  'phone',
  'industry',
  'industryOther',
  'numberOfEmployees',
  'userCount',
  'fullUsers',
  'limitedAgents',
  'productsEnabled',
  'website',
  'currencyCode',
  'contractedSeats',
  'dataMigration',
  'supportType',
  'engageContractedSeats',
  'primaryLanguage',
  'salesSegment',
] as const

export function transformSalesforceBody(
  body: Record<string, unknown>
): Record<string, unknown> {
  const raw: Record<string, string> = {}
  for (const key of SF_PARAM_KEYS) {
    const val = body[key]
    if (val !== undefined && val !== null && val !== '') {
      raw[key] = sanitizeString(String(val))
    }
  }

  if (Object.keys(raw).length === 0) return {}

  return applyTransforms(raw)
}

function applyTransforms(raw: Record<string, string>): Record<string, unknown> {
  const data: Record<string, unknown> = { ...raw }

  if (raw.numberOfEmployees) {
    const n = parseInt(raw.numberOfEmployees, 10)
    if (!isNaN(n)) {
      data.companySize = mapEmployeeCountToSize(n)
    }
  }

  if (raw.currencyCode) {
    data.currencySymbol = mapCurrencyCodeToSymbol(raw.currencyCode)
  }

  if (raw.industry || raw.industryOther) {
    data.industry = matchIndustry(raw.industry, raw.industryOther)
  }

  data.customFormsEnabled = deriveCustomFormsEnabled(raw.productsEnabled)

  for (const key of [
    'userCount',
    'fullUsers',
    'limitedAgents',
    'contractedSeats',
    'engageContractedSeats',
  ] as const) {
    if (raw[key]) {
      const n = parseInt(raw[key], 10)
      if (!isNaN(n)) data[key] = n
    }
  }

  return data
}
