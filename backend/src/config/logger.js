const pino = require('pino');
const env = require('./env');

const logger = pino({
  level: env.nodeEnv === 'test' ? 'silent' : env.logLevel,
  // El token JWT viaja en Authorization: nunca debe quedar en los logs.
  redact: ['req.headers.authorization', 'req.headers.cookie'],
  transport:
    env.nodeEnv === 'development'
      ? { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' } }
      : undefined,
});

module.exports = logger;
