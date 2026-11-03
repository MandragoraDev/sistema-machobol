const pino = require('pino');
const env = require('./env');

const logger = pino({
  level: env.nodeEnv === 'test' ? 'silent' : env.logLevel,
  // El JWT (Authorization) y el token de servicio de Rasa nunca deben quedar en los logs.
  redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-service-token"]'],
  transport:
    env.nodeEnv === 'development'
      ? { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' } }
      : undefined,
});

module.exports = logger;
