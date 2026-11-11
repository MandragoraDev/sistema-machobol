const db = require('../../src/config/db');
const { sembrar } = require('../../src/db/seeds/run');
const { firmarToken } = require('../../src/modules/auth/auth.service');
const usuariosRepository = require('../../src/modules/usuarios/usuarios.repository');

/** Las pruebas de integración solo corren si hay base de pruebas configurada. */
const describeConBD = process.env.TEST_DATABASE_URL ? describe : describe.skip;

const ADMIN = { nombre: 'Admin Pruebas', email: 'admin@pruebas.local', password: 'clave-admin-123' };

/** Vacía todas las tablas y vuelve a cargar el seed. Se niega a tocar una base que no termine en _test. */
async function reiniciarBD() {
  const { rows: [{ bd }] } = await db.query('SELECT current_database() AS bd');
  if (!bd.endsWith('_test')) {
    throw new Error(`Las pruebas se negaron a vaciar la base "${bd}".`);
  }
  const { rows } = await db.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'pgmigrations'",
  );
  await db.query(`TRUNCATE ${rows.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  await db.withTransaction((client) => sembrar(client, ADMIN));
}

/** Crea un usuario con el rol dado y devuelve su token (sin pasar por bcrypt, para que las pruebas sean rápidas). */
async function crearUsuarioConToken(rol, datos = {}) {
  const usuario = await usuariosRepository.crear({
    nombre: datos.nombre || `Usuario ${rol}`,
    email: datos.email || `${rol.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2)}@pruebas.local`,
    passwordHash: 'hash-no-usado-en-pruebas',
    rol,
  });
  return { usuario, token: firmarToken(usuario) };
}

async function tokenAdmin() {
  const { rows: [admin] } = await db.query('SELECT id, nombre, rol FROM usuarios WHERE email = $1', [ADMIN.email]);
  return firmarToken(admin);
}

async function crearCliente(waId = '59171234567', nombre = 'Juan Pérez') {
  const { rows: [cliente] } = await db.query(
    'INSERT INTO clientes (wa_id, nombre) VALUES ($1, $2) RETURNING id, wa_id, nombre',
    [waId, nombre],
  );
  return cliente;
}

/** Fija el stock de la madera del seed (Cedro 1″), la única con precios de portón en el seed. */
async function fijarStockCedro(m2) {
  await db.query("UPDATE inventario_madera SET stock_actual_m2 = $1 WHERE especie = 'Cedro'", [m2]);
}

async function idCedro() {
  const { rows: [madera] } = await db.query("SELECT id FROM inventario_madera WHERE especie = 'Cedro'");
  return madera.id;
}

/** Crea una madera con stock y sus precios por m² para cada tipo de portón ({ CORREDIZO: 2900, BATIENTE: null }). */
async function crearMaderaConPrecios({ especie, espesor = 1, stock = 0, precios = {} }) {
  const { rows: [madera] } = await db.query(
    'INSERT INTO inventario_madera (especie, espesor_pulg, stock_actual_m2) VALUES ($1, $2, $3) RETURNING id',
    [especie, espesor, stock],
  );
  for (const [tipo, precio] of Object.entries(precios)) {
    if (precio === null) continue;
    await db.query(
      `INSERT INTO precios_porton (producto_id, madera_id, precio_m2)
       SELECT id, $2, $3 FROM productos WHERE tipo_porton = $1`,
      [tipo, madera.id, precio],
    );
  }
  return madera.id;
}

module.exports = {
  db,
  describeConBD,
  ADMIN,
  reiniciarBD,
  crearUsuarioConToken,
  tokenAdmin,
  crearCliente,
  fijarStockCedro,
  idCedro,
  crearMaderaConPrecios,
};
