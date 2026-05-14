type LogLevel = 'info' | 'warn' | 'error'

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  info: 0,
  warn: 1,
  error: 2,
}

function getMinLevel(): LogLevel {
  if (process.env.NODE_ENV === 'production') return 'warn'
  return 'info'
}

export function logger(module: string) {
  const prefix = `[${module}]`
  const minPriority = LEVEL_PRIORITY[getMinLevel()]

  return {
    info: (...args: unknown[]) => {
      if (minPriority <= LEVEL_PRIORITY.info) console.log(prefix, ...args)
    },
    warn: (...args: unknown[]) => {
      if (minPriority <= LEVEL_PRIORITY.warn) console.warn(prefix, ...args)
    },
    error: (...args: unknown[]) => {
      console.error(prefix, ...args)
    },
  }
}
