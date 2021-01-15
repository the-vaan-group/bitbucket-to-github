import pino, { Logger } from 'pino'

export const initEmergencyShutdown = function initEmergencyShutdown(
  logger: Logger = pino()
): void {
  const emergencyShutdown = pino.final(
    logger,
    function emergencyShutdown(err, finalLogger) {
      finalLogger.fatal(err)
      process.exit(1)
    }
  )

  process.on('unhandledRejection', emergencyShutdown)
  process.on('uncaughtException', emergencyShutdown)
}

type ShutdownSignal = string | Error

type GracefulShutdown = (signal: ShutdownSignal) => Promise<void>

export const initGracefulShutdown = function initGracefulShutdown(
  rawLogger: Logger = pino()
): GracefulShutdown {
  const logger = pino.final(rawLogger)

  const gracefulShutdown: GracefulShutdown = async function gracefulShutdown(
    signal
  ) {
    const errors = []

    if (typeof signal === 'object') {
      logger.error(signal)
      errors.push(signal)
    }

    if (typeof signal === 'string') {
      logger.warn('Received %s', signal)
    }

    process.exit(errors.length)
  }

  process.on('SIGINT', gracefulShutdown)
  process.on('SIGQUIT', gracefulShutdown)
  process.on('SIGTERM', gracefulShutdown)

  return gracefulShutdown
}
