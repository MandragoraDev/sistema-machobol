const pino = require('pino');
const env = require('./env');

const logger = pino({
  level: env.nodeEnv === 'test' ? 'silent' : env.logLevel,
  transport:
    env.nodeEnv === 'development'
      ? { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' } }
      : undefined,
});

module.exports = logger;
