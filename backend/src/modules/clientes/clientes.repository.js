const { query } = require('../../config/db');

const COLUMNAS = 'id, wa_id, nombre, ci_nit, direccion';

async function buscarPorId(id) {
  const { rows } = await query(`SELECT ${COLUMNAS} FROM clientes WHERE id = $1`, [id]);
  return rows[0] || null;
}

async function buscarPorWaId(waId) {
  const { rows } = await query(`SELECT ${COLUMNAS} FROM clientes WHERE wa_id = $1`, [waId]);
  return rows[0] || null;
}

module.exports = { buscarPorId, buscarPorWaId };
