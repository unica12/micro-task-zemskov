const pino = require('pino');
const pinoHttp = require('pino-http');

// Создаем логгер
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    }
  } : undefined,
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
    bindings: (bindings) => {
      return {
        pid: bindings.pid,
        hostname: bindings.hostname,
        service: 'api-gateway'
      };
    }
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'password', 'token'],
    censor: '[REDACTED]'
  }
});

// Middleware для HTTP логирования
const httpLogger = pinoHttp({
  logger,
  customSuccessMessage: (req, res) => {
    return `${req.method} ${req.url} ${res.statusCode}`;
  },
  customErrorMessage: (req, res, err) => {
    return `${req.method} ${req.url} ${res.statusCode} - ${err.message}`;
  },
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      xRequestId: req.headers['x-request-id'],
      userAgent: req.headers['user-agent']
    }),
    res: (res) => ({
      statusCode: res.statusCode,
      xRequestId: res.getHeader('x-request-id')
    })
  },
  wrapSerializers: false
});

module.exports = {
  logger,
  httpLogger
};
