const { Pool } = require('pg');
const env = require('./env');
const logger = require('./logger');

// Las columnas NUMERIC llegan como string a propósito: los montos y m² no deben pasar por float.
const pool = new Pool({ connectionString: env.databaseUrl, max: 10 });

pool.on('error', (err) => {
  logger.error({ err }, 'Error inesperado en una conexión inactiva de PostgreSQL');
});

function query(text, params) {
  return pool.query(text, params);
}

/**
 * Ejecuta `fn(client)` dentro de BEGIN/COMMIT con una sola conexión.
 * Cualquier error dentro de `fn` provoca ROLLBACK y se vuelve a lanzar.
 */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await fn(client);
    await client.query('COMMIT');
    return resultado;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
