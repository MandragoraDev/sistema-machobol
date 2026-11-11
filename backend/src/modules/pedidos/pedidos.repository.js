const { query } = require('../../config/db');

const DETALLE = `
  SELECT p.id, p.codigo, p.ancho_m, p.alto_m, p.area_m2, p.precio_m2_aplicado, p.subtotal_base, p.total_adicionales,
         p.total_exacto, p.total_final, p.madera_id, p.madera_requerida_m2, p.canal, p.observaciones, p.creado_en,
         e.codigo AS estado, e.nombre AS estado_nombre, f.orden AS fase_orden, f.nombre AS fase_nombre,
         pr.nombre AS producto, pr.tipo_porton,
         c.id AS cliente_id, c.wa_id, c.nombre AS cliente_nombre, c.ci_nit,
         m.especie AS madera_especie, m.espesor_pulg AS madera_espesor_pulg
  FROM pedidos p
  JOIN estados_pedido e ON e.id = p.estado_id
  JOIN productos pr ON pr.id = p.producto_id
  JOIN clientes c ON c.id = p.cliente_id
  LEFT JOIN fases_produccion f ON f.id = p.fase_actual_id
  LEFT JOIN inventario_madera m ON m.id = p.madera_id`;

async function obtenerPorCodigo(codigo) {
  const { rows: [pedido] } = await query(`${DETALLE} WHERE p.codigo = $1`, [codigo]);
  if (!pedido) return null;
  const { rows: adicionales } = await query(
    `SELECT a.codigo, a.nombre, a.tipo_adicional, pa.precio_aplicado AS precio
     FROM pedido_accesorios pa
     JOIN accesorios a ON a.id = pa.accesorio_id
     WHERE pa.pedido_id = $1
     ORDER BY a.tipo_adicional, a.id`,
    [pedido.id],
  );
  return { ...pedido, adicionales };
}

/**
 * Siguiente código MCH-AAAA-NNNN (año de Bolivia). El candado de transacción serializa a quienes
 * crean pedidos a la vez; el índice único uq_pedidos_codigo queda como red de seguridad.
 */
async function siguienteCodigo(client) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext('pedidos.codigo'))");
  const { rows: [{ anio, ultimo }] } = await client.query(
    `SELECT to_char(now() AT TIME ZONE 'America/La_Paz', 'YYYY') AS anio,
            max(substring(codigo FROM 10)::int) AS ultimo
     FROM pedidos
     WHERE codigo LIKE 'MCH-' || to_char(now() AT TIME ZONE 'America/La_Paz', 'YYYY') || '-%'`,
  );
  return `MCH-${anio}-${String((ultimo ?? 0) + 1).padStart(4, '0')}`;
}

async function insertar(client, p) {
  const { rows: [{ id }] } = await client.query(
    `INSERT INTO pedidos
       (codigo, cliente_id, producto_id, ancho_m, alto_m, precio_m2_aplicado, subtotal_base, total_adicionales,
        total_exacto, total_final, madera_id, madera_requerida_m2, estado_id, canal, creado_por, observaciones)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
             (SELECT id FROM estados_pedido WHERE codigo = 'COTIZADO'), $13, $14, $15)
     RETURNING id`,
    [p.codigo, p.cliente_id, p.producto_id, p.ancho_m, p.alto_m, p.precio_m2_aplicado, p.subtotal_base,
      p.total_adicionales, p.total_exacto, p.total_final, p.madera_id, p.madera_requerida_m2, p.canal,
      p.creado_por, p.observaciones],
  );
  return id;
}

/** Accesorios y recargos con su precio congelado: si el catálogo cambia después, la cotización no se altera. */
async function insertarAdicionales(client, pedidoId, adicionales) {
  for (const adicional of adicionales) {
    await client.query(
      'INSERT INTO pedido_accesorios (pedido_id, accesorio_id, precio_aplicado) VALUES ($1, $2, $3)',
      [pedidoId, adicional.id, adicional.precio],
    );
  }
}

/** Bloquea el pedido (FOR UPDATE) y devuelve lo necesario para cobrarlo o confirmar su pago. */
async function bloquear(client, { id, codigo }) {
  const { rows } = await client.query(
    `SELECT p.id, p.codigo, p.cliente_id, c.wa_id, p.total_final, p.madera_id, p.madera_requerida_m2, p.creado_en,
            e.codigo AS estado, e.nombre AS estado_nombre
     FROM pedidos p
     JOIN estados_pedido e ON e.id = p.estado_id
     JOIN clientes c ON c.id = p.cliente_id
     WHERE ${id ? 'p.id = $1' : 'p.codigo = $1'}
     FOR UPDATE OF p`,
    [id ?? codigo],
  );
  return rows[0] || null;
}

async function cambiarEstado(client, id, estado) {
  await client.query(
    'UPDATE pedidos SET estado_id = (SELECT id FROM estados_pedido WHERE codigo = $2) WHERE id = $1',
    [id, estado],
  );
}

/** Pago confirmado: el pedido pasa a EN_PRODUCCION y entra a la fase 1. */
async function iniciarProduccion(client, id) {
  const { rows: [fase] } = await client.query(
    `WITH fase AS (SELECT id, nombre FROM fases_produccion WHERE orden = 1)
     UPDATE pedidos
     SET estado_id = (SELECT id FROM estados_pedido WHERE codigo = 'EN_PRODUCCION'),
         fase_actual_id = (SELECT id FROM fase)
     WHERE id = $1
     RETURNING fase_actual_id AS id, (SELECT nombre FROM fase) AS nombre`,
    [id],
  );
  return fase;
}

async function registrarHistorial(client, { pedidoId, faseId, usuarioId = null, observacion }) {
  await client.query(
    'INSERT INTO historial_fases (pedido_id, fase_id, usuario_id, observacion) VALUES ($1, $2, $3, $4)',
    [pedidoId, faseId, usuarioId, observacion],
  );
}

module.exports = {
  obtenerPorCodigo,
  siguienteCodigo,
  insertar,
  insertarAdicionales,
  bloquear,
  cambiarEstado,
  iniciarProduccion,
  registrarHistorial,
};
