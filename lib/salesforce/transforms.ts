import { INDUSTRIES } from '@/lib/constants/industries'
import { sanitizeString } from '@/lib/utils/sanitize'

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

const STRING_FIELDS = [
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
  'website',
  'currencyCode',
  'supportType',
  'primaryLanguage',
  'salesSegment',
  'numberOfEmployees',
  'productsEnabled',
  'fpPaymentsProvider',
] as const

const NUMBER_FIELDS = [
  'userCount',
  'fullUsers',
  'limitedAgents',
  'contractedSeats',
  'engageContractedSeats',
] as const

const BOOLEAN_FIELDS = [
  'dataMigration',
  'customerCommunicationEnabled',
  'quickbooksOnlineEnabled',
  'quickbooksDesktopEnabled',
  'fpPaymentsEnabled',
  'customFormsEnabled',
  'engageEnabled',
] as const

/**
 * Transform a validated JSON body from POST /api/salesforce/generate-link
 * into the salesforce_data blob stored on the wizard_sessions row.
 *
 * Preserves native types — booleans stay boolean, numbers stay number.
 * String fields are sanitized. Adds derivations (currencySymbol, companySize,
 * matched industry, customFormsEnabled fallback).
 */
export function transformSalesforceBody(
  body: Record<string, unknown>
): Record<string, unknown> {
  const data: Record<string, unknown> = {}

  for (const key of STRING_FIELDS) {
    const val = body[key]
    if (typeof val === 'string' && val !== '') {
      data[key] = sanitizeString(val)
    }
  }

  for (const key of NUMBER_FIELDS) {
    const val = body[key]
    if (typeof val === 'number' && Number.isFinite(val)) {
      data[key] = val
    }
  }

  for (const key of BOOLEAN_FIELDS) {
    const val = body[key]
    if (typeof val === 'boolean') {
      data[key] = val
    }
  }

  // Derivations

  // companySize: SF picklist string already matches the wizard's enum format.
  // Pass through directly so the wizard UI can prefill without a second lookup.
  if (typeof data.numberOfEmployees === 'string') {
    data.companySize = data.numberOfEmployees
  }

  // currencyCode -> currencySymbol for UI rendering
  if (typeof data.currencyCode === 'string') {
    data.currencySymbol = mapCurrencyCodeToSymbol(data.currencyCode)
  }

  // industry / industryOther -> match against the wizard's industry list
  if (data.industry || data.industryOther) {
    const matched = matchIndustry(
      typeof data.industry === 'string' ? data.industry : undefined,
      typeof data.industryOther === 'string' ? data.industryOther : undefined
    )
    if (matched) data.industry = matched
  }

  // customFormsEnabled: prefer the explicit boolean. If not provided, fall
  // back to deriving from the legacy productsEnabled string.
  if (
    typeof data.customFormsEnabled !== 'boolean' &&
    typeof data.productsEnabled === 'string'
  ) {
    data.customFormsEnabled = deriveCustomFormsEnabled(data.productsEnabled)
  }

  return data
}
