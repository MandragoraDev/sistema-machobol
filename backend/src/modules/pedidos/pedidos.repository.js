const { query } = require('../../config/db');

const DETALLE = `
  SELECT p.id, p.codigo, p.ancho_m, p.alto_m, p.area_m2, p.precio_m2_aplicado, p.subtotal_base, p.total_adicionales,
         p.total_exacto, p.total_final, p.madera_id, p.madera_requerida_m2, p.canal, p.observaciones, p.creado_en,
         p.fuera_ciudad, p.fecha_reunion, p.preferencia_reunion,
         to_char(p.fecha_instalacion, 'YYYY-MM-DD') AS fecha_instalacion,
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
        total_exacto, total_final, madera_id, madera_requerida_m2, estado_id, canal, creado_por, observaciones, fuera_ciudad)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
             (SELECT id FROM estados_pedido WHERE codigo = 'COTIZADO'), $13, $14, $15, $16)
     RETURNING id`,
    [p.codigo, p.cliente_id, p.producto_id, p.ancho_m, p.alto_m, p.precio_m2_aplicado, p.subtotal_base,
      p.total_adicionales, p.total_exacto, p.total_final, p.madera_id, p.madera_requerida_m2, p.canal,
      p.creado_por, p.observaciones, p.fuera_ciudad],
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

/** Bloquea el pedido (FOR UPDATE) y devuelve lo necesario para registrar pagos, iniciar la producción o moverlo de fase. */
async function bloquear(client, { id, codigo }) {
  const { rows } = await client.query(
    `SELECT p.id, p.codigo, p.cliente_id, c.wa_id, c.nombre AS cliente_nombre, p.total_final, p.madera_id,
            p.madera_requerida_m2, p.creado_en, p.fecha_reunion,
            e.codigo AS estado, e.nombre AS estado_nombre, f.orden AS fase_orden
     FROM pedidos p
     JOIN estados_pedido e ON e.id = p.estado_id
     JOIN clientes c ON c.id = p.cliente_id
     LEFT JOIN fases_produccion f ON f.id = p.fase_actual_id
     WHERE ${id ? 'p.id = $1' : 'p.codigo = $1'}
     FOR UPDATE OF p`,
    [id ?? codigo],
  );
  return rows[0] || null;
}

/**
 * Quién hace el próximo cambio de estado y por qué. El trigger trg_pedidos_historial lo copia al historial
 * inmutable. Vale hasta el final de la transacción: se llama antes de cada cambio.
 */
async function anotarCambio(client, { usuarioId = null, motivo = null }) {
  await client.query(
    "SELECT set_config('machobol.usuario_id', $1, true), set_config('machobol.motivo', $2, true)",
    [usuarioId ? String(usuarioId) : '', motivo ?? ''],
  );
}

async function cambiarEstado(client, id, estado) {
  await client.query(
    'UPDATE pedidos SET estado_id = (SELECT id FROM estados_pedido WHERE codigo = $2) WHERE id = $1',
    [id, estado],
  );
}

/** Lleva el pedido a un estado y una fase (por su orden, 1 a 11). Devuelve el nombre de la fase. */
async function moverA(client, id, { estado, fase }) {
  const { rows: [resultado] } = await client.query(
    `WITH fase AS (SELECT id, nombre FROM fases_produccion WHERE orden = $3)
     UPDATE pedidos
     SET estado_id = (SELECT id FROM estados_pedido WHERE codigo = $2),
         fase_actual_id = (SELECT id FROM fase)
     WHERE id = $1
     RETURNING fase_actual_id AS id, (SELECT nombre FROM fase) AS nombre`,
    [id, estado, fase],
  );
  return resultado;
}

/** Anticipo cubierto y madera descontada: el pedido pasa a EN_PRODUCCION y entra a la fase 1. */
function iniciarProduccion(client, id) {
  return moverA(client, id, { estado: 'EN_PRODUCCION', fase: 1 });
}

async function programarInstalacion(codigo, fecha) {
  await query('UPDATE pedidos SET fecha_instalacion = $2 WHERE codigo = $1', [codigo, fecha]);
}

/**
 * Pedidos de un cliente para el bot ("¿cómo va mi pedido?"): los más recientes primero, sin los cancelados.
 * Con `codigo`, solo ese pedido y solo si es del cliente.
 */
async function resumenDelCliente(waId, codigo = null) {
  const { rows } = await query(
    `SELECT p.codigo, e.codigo AS estado, e.nombre AS estado_nombre, f.orden AS fase_orden, f.nombre AS fase_nombre,
            p.total_final, p.fecha_reunion, to_char(p.fecha_instalacion, 'YYYY-MM-DD') AS fecha_instalacion,
            COALESCE((SELECT sum(pg.monto) FROM pagos pg WHERE pg.pedido_id = p.id AND pg.anulado_en IS NULL), 0)::numeric(12,2)::text AS pagado
     FROM pedidos p
     JOIN clientes c ON c.id = p.cliente_id
     JOIN estados_pedido e ON e.id = p.estado_id
     LEFT JOIN fases_produccion f ON f.id = p.fase_actual_id
     WHERE c.wa_id = $1 AND ($2::text IS NULL OR p.codigo = $2) AND e.codigo <> 'CANCELADO'
     ORDER BY p.id DESC
     LIMIT 3`,
    [waId, codigo],
  );
  return rows;
}

/** El cliente pidió una reunión con un asesor (con el día y horario que le convienen). */
async function solicitarReunion(client, id, preferencia) {
  await client.query(
    `UPDATE pedidos
     SET preferencia_reunion = $2, estado_id = (SELECT id FROM estados_pedido WHERE codigo = 'REUNION_SOLICITADA')
     WHERE id = $1`,
    [id, preferencia],
  );
}

/** El asesor fijó (o cambió) la fecha de la reunión. */
async function agendarReunion(client, id, fecha) {
  await client.query(
    `UPDATE pedidos
     SET fecha_reunion = $2, estado_id = (SELECT id FROM estados_pedido WHERE codigo = 'REUNION_AGENDADA')
     WHERE id = $1`,
    [id, fecha],
  );
}

/** Precio final acordado en persona (el trigger lo deja en el historial con el precio anterior y el motivo). */
async function acordarPrecio(client, id, total) {
  await client.query('UPDATE pedidos SET total_final = $2 WHERE id = $1', [id, total]);
}

module.exports = {
  obtenerPorCodigo,
  siguienteCodigo,
  insertar,
  insertarAdicionales,
  bloquear,
  anotarCambio,
  cambiarEstado,
  moverA,
  iniciarProduccion,
  programarInstalacion,
  resumenDelCliente,
  solicitarReunion,
  agendarReunion,
  acordarPrecio,
};
