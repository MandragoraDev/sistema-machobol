/**
 * Crea el rol y la base de datos que indica DATABASE_URL (y TEST_DATABASE_URL, si está definida),
 * usando la conexión de superusuario PG_ADMIN_URL. Es idempotente: lo que ya existe no se toca.
 *
 * El rol de la aplicación es dueño de su base de datos (puede migrarla) pero no es
 * superusuario ni puede crear otras bases de datos o roles.
 */
const path = require('node:path');
const { Client } = require('pg');

require('dotenv').config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

async function crearRolYBase(client, url) {
  const destino = new URL(url);
  const rol = decodeURIComponent(destino.username);
  const password = decodeURIComponent(destino.password);
  const baseDatos = decodeURIComponent(destino.pathname.slice(1));
  if (!rol || !password || !baseDatos) {
    throw new Error(`La URL de "${baseDatos || url}" debe incluir usuario, contraseña y nombre de la base de datos.`);
  }

  const rolExistente = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [rol]);
  if (rolExistente.rowCount === 0) {
    await client.query(
      `CREATE ROLE ${client.escapeIdentifier(rol)} LOGIN PASSWORD ${client.escapeLiteral(password)}
       NOSUPERUSER NOCREATEDB NOCREATEROLE`,
    );
    console.log(`Rol "${rol}" creado.`);
  } else {
    console.log(`El rol "${rol}" ya existía; no se modificó.`);
  }

  const bdExistente = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [baseDatos]);
  if (bdExistente.rowCount === 0) {
    await client.query(
      `CREATE DATABASE ${client.escapeIdentifier(baseDatos)}
       OWNER ${client.escapeIdentifier(rol)} ENCODING 'UTF8' TEMPLATE template0`,
    );
    console.log(`Base de datos "${baseDatos}" creada.`);
  } else {
    console.log(`La base de datos "${baseDatos}" ya existía; no se modificó.`);
  }
}

async function main() {
  const { PG_ADMIN_URL, DATABASE_URL, TEST_DATABASE_URL } = process.env;
  if (!PG_ADMIN_URL || !DATABASE_URL) {
    throw new Error('Define PG_ADMIN_URL y DATABASE_URL en el .env (ver .env.example).');
  }

  const client = new Client({ connectionString: PG_ADMIN_URL });
  await client.connect();
  try {
    for (const url of [DATABASE_URL, TEST_DATABASE_URL].filter(Boolean)) {
      await crearRolYBase(client, url);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`Error en db:setup: ${err.message}`);
  process.exitCode = 1;
});
