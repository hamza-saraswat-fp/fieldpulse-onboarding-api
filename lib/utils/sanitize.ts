export function sanitizeString(val: unknown, maxLen = 255): string {
  if (typeof val !== 'string') return ''
  return val.replace(/<[^>]*>/g, '').trim().slice(0, maxLen)
}

export function sanitizeNumber(val: unknown, fallback = 0): number {
  const n = Number(val)
  return Number.isFinite(n) ? n : fallback
}
