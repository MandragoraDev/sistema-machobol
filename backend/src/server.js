const app = require('./app');
const env = require('./config/env');
const logger = require('./config/logger');
const { pool } = require('./config/db');
const { esperarPendientes } = require('./utils/segundoPlano');

const server = app.listen(env.port, (err) => {
  if (err) {
    logger.fatal({ err }, `No se pudo iniciar la API en el puerto ${env.port}`);
    process.exit(1);
  }
  logger.info(`API de MACHOBOL escuchando en http://localhost:${env.port}`);
});

function apagar(senal) {
  logger.info(`${senal} recibido: cerrando la API`);
  // Antes de cerrar la BD se terminan de enviar las respuestas de WhatsApp en curso.
  server.close(() => {
    esperarPendientes()
      .then(() => pool.end())
      .finally(() => process.exit(0));
  });
}

process.on('SIGINT', () => apagar('SIGINT'));
process.on('SIGTERM', () => apagar('SIGTERM'));
