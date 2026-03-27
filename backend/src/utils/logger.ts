import winston from 'winston';

const { combine, timestamp, json, colorize, printf } = winston.format;

const customFormat = printf(({ level, msg, timestamp, ...ctx }) => {
  return `${timestamp} [${level}]: ${msg} ${Object.keys(ctx).length ? JSON.stringify(ctx) : ''}`;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp(),
    json()
  ),
  transports: [
    new winston.transports.Console({
      format: combine(
        colorize(),
        timestamp({ format: 'HH:mm:ss' }),
        customFormat
      )
    }),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

// Native child() is already available in winston 3.x
export const createChildLogger = (defaults: Record<string, any>) => {
  return logger.child(defaults);
};
