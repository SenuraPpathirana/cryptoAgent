import winston from 'winston';
import { env } from './env';

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta, null, 2)}`;
    }
    return msg;
  })
);

// Create logger instance
export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: logFormat,
  defaultMeta: { service: 'crypto-telegram-agent' },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: env.NODE_ENV === 'development' ? consoleFormat : logFormat,
    }),
    // File transport for errors
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // File transport for all logs
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
  ],
});

// Stream for Morgan HTTP logger
export const httpLoggerStream = {
  write: (message: string) => {
    logger.info(message.trim());
  },
};

// Helper functions
export const logInfo = (message: string, meta?: Record<string, any>) => {
  logger.info(message, meta);
};

export const logError = (message: string, error?: Error | unknown, meta?: Record<string, any>) => {
  if (error instanceof Error) {
    logger.error(message, { error: error.message, stack: error.stack, ...meta });
  } else {
    logger.error(message, { error, ...meta });
  }
};

export const logWarn = (message: string, meta?: Record<string, any>) => {
  logger.warn(message, meta);
};

export const logDebug = (message: string, meta?: Record<string, any>) => {
  logger.debug(message, meta);
};

// Module-specific loggers
export const createModuleLogger = (moduleName: string) => {
  return {
    info: (message: string, meta?: Record<string, any>) =>
      logger.info(`[${moduleName}] ${message}`, meta),
    error: (message: string, error?: Error | unknown, meta?: Record<string, any>) => {
      if (error instanceof Error) {
        logger.error(`[${moduleName}] ${message}`, {
          error: error.message,
          stack: error.stack,
          ...meta,
        });
      } else {
        logger.error(`[${moduleName}] ${message}`, { error, ...meta });
      }
    },
    warn: (message: string, meta?: Record<string, any>) =>
      logger.warn(`[${moduleName}] ${message}`, meta),
    debug: (message: string, meta?: Record<string, any>) =>
      logger.debug(`[${moduleName}] ${message}`, meta),
  };
};

export default logger;
