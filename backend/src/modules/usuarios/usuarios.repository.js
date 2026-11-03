const db = require('../../config/db');
const { asignaciones } = require('../../utils/sql');

// password_hash nunca forma parte de las columnas públicas.
const COLUMNAS = 'id, nombre, email, rol, activo, creado_en, actualizado_en';

async function listar() {
  const { rows } = await db.query(`SELECT ${COLUMNAS} FROM usuarios ORDER BY activo DESC, nombre`);
  return rows;
}

async function buscarPorId(id) {
  const { rows } = await db.query(`SELECT ${COLUMNAS} FROM usuarios WHERE id = $1`, [id]);
  return rows[0] || null;
}

/** Única consulta que devuelve password_hash: solo para verificar credenciales en el login. */
async function buscarCredenciales(email) {
  const { rows } = await db.query(`SELECT ${COLUMNAS}, password_hash FROM usuarios WHERE email = $1`, [email]);
  return rows[0] || null;
}

async function crear({ nombre, email, passwordHash, rol }) {
  const { rows } = await db.query(
    `INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES ($1, $2, $3, $4)
     RETURNING ${COLUMNAS}`,
    [nombre, email, passwordHash, rol],
  );
  return rows[0];
}

async function actualizar(id, cambios) {
  const { rows } = await db.query(
    `UPDATE usuarios SET ${asignaciones(cambios)} WHERE id = $1 RETURNING ${COLUMNAS}`,
    [id, ...Object.values(cambios)],
  );
  return rows[0] || null;
}

module.exports = { listar, buscarPorId, buscarCredenciales, crear, actualizar };
