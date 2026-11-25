const { query } = require('../../config/db');

const COLUMNAS = `pg.id, pg.pedido_id, pg.monto, pg.metodo, pg.referencia, pg.observacion, pg.creado_en,
  pg.anulado_en, pg.motivo_anulacion, ur.nombre AS registrado_por, ua.nombre AS anulado_por`;
const DESDE = `FROM pagos pg
  LEFT JOIN usuarios ur ON ur.id = pg.registrado_por
  LEFT JOIN usuarios ua ON ua.id = pg.anulado_por`;

/** Pagos del pedido, del más antiguo al más reciente (incluye los anulados, para la trazabilidad). */
async function listarDePedido(pedidoId, client = { query }) {
  const { rows } = await client.query(`SELECT ${COLUMNAS} ${DESDE} WHERE pg.pedido_id = $1 ORDER BY pg.id`, [pedidoId]);
  return rows;
}

async function insertar(client, p) {
  const { rows: [{ id }] } = await client.query(
    `INSERT INTO pagos (pedido_id, monto, metodo, referencia, observacion, registrado_por)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [p.pedido_id, p.monto, p.metodo, p.referencia, p.observacion, p.registrado_por],
  );
  return id;
}

/** Bloquea el pago (FOR UPDATE) para anularlo. */
async function bloquear(client, id) {
  const { rows } = await client.query('SELECT id, pedido_id, monto, anulado_en FROM pagos WHERE id = $1 FOR UPDATE', [id]);
  return rows[0] || null;
}

async function anular(client, id, { usuarioId, motivo }) {
  await client.query(
    'UPDATE pagos SET anulado_en = now(), anulado_por = $2, motivo_anulacion = $3 WHERE id = $1',
    [id, usuarioId, motivo],
  );
}

/** Suma de los pagos vigentes (no anulados) del pedido, como texto exacto ("1234.50"). */
async function totalVigente(client, pedidoId) {
  const { rows: [{ total }] } = await client.query(
    'SELECT COALESCE(sum(monto), 0)::numeric(12,2)::text AS total FROM pagos WHERE pedido_id = $1 AND anulado_en IS NULL',
    [pedidoId],
  );
  return total;
}

/** Ventas del mes en curso (hora de Bolivia): suma y cantidad de pagos vigentes. */
async function ventasDelMes() {
  const { rows: [resultado] } = await query(
    `SELECT COALESCE(sum(monto), 0)::numeric(12,2)::text AS total, count(*)::int AS pagos
     FROM pagos
     WHERE anulado_en IS NULL
       AND creado_en >= date_trunc('month', now() AT TIME ZONE 'America/La_Paz') AT TIME ZONE 'America/La_Paz'`,
  );
  return resultado;
}

module.exports = { listarDePedido, insertar, bloquear, anular, totalVigente, ventasDelMes };
