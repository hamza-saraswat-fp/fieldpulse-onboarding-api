import { describe, it, expect } from 'vitest'
import { generateLinkSchema } from './generate-link.schema'

// Minimal payload that satisfies the two required fields. Spread into each
// case so tests only vary the field under test.
const base = {
  salesforceAccountId: 'acct-1',
  companyId: 'co-1',
}

describe('generateLinkSchema — lenient picklist enums', () => {
  it('accepts a minimal valid payload', () => {
    const result = generateLinkSchema.safeParse(base)
    expect(result.success).toBe(true)
  })

  it('drops a deactivated numberOfEmployees value ("1-2") instead of 400ing', () => {
    const result = generateLinkSchema.safeParse({
      ...base,
      numberOfEmployees: '1-2',
    })
    expect(result.success).toBe(true)
    expect(result.data?.numberOfEmployees).toBeUndefined()
  })

  it('keeps an old-still-valid numberOfEmployees value ("11-20")', () => {
    const result = generateLinkSchema.safeParse({
      ...base,
      numberOfEmployees: '11-20',
    })
    expect(result.success).toBe(true)
    expect(result.data?.numberOfEmployees).toBe('11-20')
  })

  it('keeps a new-bucket numberOfEmployees value ("1")', () => {
    const result = generateLinkSchema.safeParse({
      ...base,
      numberOfEmployees: '1',
    })
    expect(result.success).toBe(true)
    expect(result.data?.numberOfEmployees).toBe('1')
  })

  it('applies the same leniency to sibling picklists (drops unknown currencyCode)', () => {
    const result = generateLinkSchema.safeParse({
      ...base,
      currencyCode: 'GBP',
    })
    expect(result.success).toBe(true)
    expect(result.data?.currencyCode).toBeUndefined()
  })

  it('keeps a recognized sibling picklist value (currencyCode "USD")', () => {
    const result = generateLinkSchema.safeParse({
      ...base,
      currencyCode: 'USD',
    })
    expect(result.success).toBe(true)
    expect(result.data?.currencyCode).toBe('USD')
  })

  it('still 400s (fails) when a required field is missing', () => {
    const { companyId, ...withoutCompanyId } = base
    void companyId
    const result = generateLinkSchema.safeParse(withoutCompanyId)
    expect(result.success).toBe(false)
  })
})
