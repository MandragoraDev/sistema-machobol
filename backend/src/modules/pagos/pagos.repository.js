const { query } = require('../../config/db');

const COLUMNAS = 'id, pedido_id, transaccion_id, monto, estado, qr_payload, expira_en, confirmado_en, creado_en';

async function pendienteVigente(client, pedidoId) {
  const { rows } = await client.query(
    `SELECT ${COLUMNAS} FROM pagos_qr
     WHERE pedido_id = $1 AND estado = 'PENDIENTE' AND expira_en > now()
     ORDER BY id DESC
     LIMIT 1`,
    [pedidoId],
  );
  return rows[0] || null;
}

async function expirarVencidos(client, pedidoId) {
  await client.query(
    "UPDATE pagos_qr SET estado = 'EXPIRADO' WHERE pedido_id = $1 AND estado = 'PENDIENTE' AND expira_en <= now()",
    [pedidoId],
  );
}

async function insertar(client, p) {
  const { rows: [pago] } = await client.query(
    `INSERT INTO pagos_qr (pedido_id, transaccion_id, monto, qr_payload, expira_en)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${COLUMNAS}`,
    [p.pedido_id, p.transaccion_id, p.monto, p.qr_payload, p.expira_en],
  );
  return pago;
}

/** Primer candado de la transacción de pago: hace idempotente el callback (PLAN §2.3). */
async function bloquear(client, { id, transaccionId }) {
  const { rows } = await client.query(
    `SELECT ${COLUMNAS} FROM pagos_qr WHERE ${id ? 'id = $1' : 'transaccion_id = $1'} FOR UPDATE`,
    [id ?? transaccionId],
  );
  return rows[0] || null;
}

async function cambiarEstado(client, id, estado) {
  await client.query(
    `UPDATE pagos_qr
     SET estado = $2::estado_pago,
         confirmado_en = CASE WHEN $2::estado_pago = 'CONFIRMADO' THEN now() ELSE confirmado_en END
     WHERE id = $1`,
    [id, estado],
  );
}

async function buscarPorId(id) {
  const { rows } = await query(`SELECT ${COLUMNAS} FROM pagos_qr WHERE id = $1`, [id]);
  return rows[0] || null;
}

module.exports = { pendienteVigente, expirarVencidos, insertar, bloquear, cambiarEstado, buscarPorId };
