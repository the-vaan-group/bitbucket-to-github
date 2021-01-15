import pino from 'pino'

const REDACT_PATHS: string[] = []

interface LoggerOptions {
  mode: 'development' | 'production' | 'test'
  name: string
}

type MakeLogger = (options: LoggerOptions) => pino.Logger

export const makeLogger: MakeLogger = function makeLogger({
  mode = 'development',
  name
}) {
  const enabled = mode !== 'test'

  const level = mode === 'production' ? 'debug' : 'trace'

  // LogDNA parses level labels only
  const formatters = {
    level(label: string, number: number) {
      return { level: mode === 'production' ? label : number }
    }
  }

  // LogDNA requires message key to be 'message'
  const messageKey = mode === 'production' ? 'message' : 'msg'

  return pino({
    enabled,
    formatters,
    level,
    messageKey,
    name,
    prettyPrint: mode !== 'production',
    redact: { censor: '[REDACTED]', paths: REDACT_PATHS }
  })
}
