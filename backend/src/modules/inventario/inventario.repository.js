const db = require('../../config/db');
const { asignaciones } = require('../../utils/sql');

const COLUMNAS_MADERA = `id, especie, espesor_pulg, stock_actual_m2, stock_minimo_m2, activo,
  (stock_actual_m2 <= stock_minimo_m2) AS bajo_minimo, actualizado_en`;

async function listarMaderas({ incluirInactivas }) {
  const { rows } = await db.query(
    `SELECT ${COLUMNAS_MADERA} FROM inventario_madera
     ${incluirInactivas ? '' : 'WHERE activo'}
     ORDER BY especie, espesor_pulg`,
  );
  return rows;
}

/** Totales de las maderas activas. Los count se convierten a int: node-postgres devuelve BIGINT como string. */
async function resumen() {
  const { rows } = await db.query(
    `SELECT COALESCE(sum(stock_actual_m2), 0) AS stock_total_m2,
            count(*)::int AS maderas,
            (count(*) FILTER (WHERE stock_actual_m2 <= stock_minimo_m2))::int AS bajo_minimo
     FROM inventario_madera
     WHERE activo`,
  );
  return rows[0];
}

async function crearMadera({ especie, espesor_pulg, stock_minimo_m2 }) {
  const { rows } = await db.query(
    `INSERT INTO inventario_madera (especie, espesor_pulg, stock_minimo_m2) VALUES ($1, $2, $3)
     RETURNING ${COLUMNAS_MADERA}`,
    [especie, espesor_pulg, stock_minimo_m2],
  );
  return rows[0];
}

async function actualizarMadera(id, cambios) {
  const { rows } = await db.query(
    `UPDATE inventario_madera SET ${asignaciones(cambios)} WHERE id = $1 RETURNING ${COLUMNAS_MADERA}`,
    [id, ...Object.values(cambios)],
  );
  return rows[0] || null;
}

/** Bloquea la fila hasta el fin de la transacción: serializa los movimientos sobre la misma madera. */
async function bloquearMadera(client, id) {
  const { rows } = await client.query(
    'SELECT id, especie, espesor_pulg, stock_actual_m2, activo FROM inventario_madera WHERE id = $1 FOR UPDATE',
    [id],
  );
  return rows[0] || null;
}

/** Suma `deltaM2` (con signo) al stock. Devuelve null, sin modificar nada, si el stock quedaría negativo. */
async function sumarStock(client, id, deltaM2) {
  const { rows } = await client.query(
    `UPDATE inventario_madera SET stock_actual_m2 = stock_actual_m2 + $2
     WHERE id = $1 AND stock_actual_m2 + $2 >= 0
     RETURNING stock_actual_m2`,
    [id, deltaM2],
  );
  return rows[0] || null;
}

async function insertarMovimiento(client, m) {
  const { rows } = await client.query(
    `INSERT INTO movimientos_inventario
       (madera_id, tipo, cantidad_m2, stock_resultante_m2, piezas, ancho_pulg, largo_pies, pedido_id, usuario_id, motivo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [m.madera_id, m.tipo, m.cantidad_m2, m.stock_resultante_m2, m.piezas ?? null, m.ancho_pulg ?? null,
      m.largo_pies ?? null, m.pedido_id ?? null, m.usuario_id ?? null, m.motivo ?? null],
  );
  return rows[0];
}

async function listarMovimientos({ madera_id, tipo, pagina, limite }) {
  const condiciones = [];
  const valores = [];
  if (madera_id) {
    valores.push(madera_id);
    condiciones.push(`m.madera_id = $${valores.length}`);
  }
  if (tipo) {
    valores.push(tipo);
    condiciones.push(`m.tipo = $${valores.length}`);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  const { rows: [{ total }] } = await db.query(
    `SELECT count(*)::int AS total FROM movimientos_inventario m ${where}`,
    valores,
  );
  const { rows } = await db.query(
    `SELECT m.id, m.tipo, m.cantidad_m2, m.stock_resultante_m2, m.piezas, m.ancho_pulg, m.largo_pies,
            m.motivo, m.pedido_id, m.creado_en, m.madera_id, im.especie, im.espesor_pulg, u.nombre AS usuario
     FROM movimientos_inventario m
     JOIN inventario_madera im ON im.id = m.madera_id
     LEFT JOIN usuarios u ON u.id = m.usuario_id
     ${where}
     ORDER BY m.creado_en DESC, m.id DESC
     LIMIT $${valores.length + 1} OFFSET $${valores.length + 2}`,
    [...valores, limite, (pagina - 1) * limite],
  );
  return { datos: rows, total, pagina, limite };
}

module.exports = {
  listarMaderas,
  resumen,
  crearMadera,
  actualizarMadera,
  bloquearMadera,
  sumarStock,
  insertarMovimiento,
  listarMovimientos,
};
