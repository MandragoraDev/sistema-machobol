// Corre una vez antes de todas las pruebas: aplica las migraciones pendientes a la base de pruebas.
const path = require('node:path');
const { execSync } = require('node:child_process');

module.exports = async () => {
  require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    console.warn('\nTEST_DATABASE_URL no está definida: se omiten las pruebas que usan PostgreSQL.\n');
    return;
  }
  if (!new URL(url).pathname.endsWith('_test')) {
    throw new Error('TEST_DATABASE_URL debe apuntar a una base cuyo nombre termine en _test.');
  }

  execSync('npx node-pg-migrate up -m src/db/migrations', {
    cwd: path.resolve(__dirname, '../..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
};
