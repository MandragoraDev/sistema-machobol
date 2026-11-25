const { query } = require('../../config/db');

// Etapas de la venta, antes de la producción.
const ESTADOS_VENTA = ['COTIZADO', 'REUNION_SOLICITADA', 'REUNION_AGENDADA', 'REVISION_STOCK'];

/** Pedidos en etapa de venta, con lo pagado. Las reuniones por agendar primero, luego por fecha de reunión. */
async function listar({ estados = ESTADOS_VENTA } = {}) {
  const { rows } = await query(
    `SELECT p.codigo, e.codigo AS estado, e.nombre AS estado_nombre, c.nombre AS cliente, c.wa_id, p.canal,
            pr.tipo_porton, p.ancho_m, p.alto_m, p.total_exacto, p.total_final, p.fuera_ciudad,
            p.preferencia_reunion, p.fecha_reunion, p.creado_en,
            COALESCE((SELECT sum(pg.monto) FROM pagos pg WHERE pg.pedido_id = p.id AND pg.anulado_en IS NULL), 0)::numeric(12,2)::text AS pagado
     FROM pedidos p
     JOIN estados_pedido e ON e.id = p.estado_id
     JOIN clientes c ON c.id = p.cliente_id
     JOIN productos pr ON pr.id = p.producto_id
     WHERE e.codigo = ANY($1)
     ORDER BY CASE e.codigo WHEN 'REUNION_SOLICITADA' THEN 0 WHEN 'REVISION_STOCK' THEN 1 WHEN 'REUNION_AGENDADA' THEN 2 ELSE 3 END,
              p.fecha_reunion NULLS LAST, p.id DESC
     LIMIT 200`,
    [estados],
  );
  return rows;
}

/** Contadores del Dashboard: reuniones por agendar, reuniones próximas y pedidos que esperan madera. */
async function contadores() {
  const { rows: [resultado] } = await query(
    `SELECT count(*) FILTER (WHERE e.codigo = 'REUNION_SOLICITADA')::int AS reuniones_por_agendar,
            count(*) FILTER (WHERE e.codigo = 'REUNION_AGENDADA' AND p.fecha_reunion >= now())::int AS reuniones_proximas,
            count(*) FILTER (WHERE e.codigo = 'REVISION_STOCK')::int AS sin_madera
     FROM pedidos p
     JOIN estados_pedido e ON e.id = p.estado_id`,
  );
  return resultado;
}

/** Datos de la madera después de un descuento, para avisar si quedó por debajo del mínimo. */
async function madera(client, id) {
  const { rows } = await client.query(
    'SELECT id, especie, espesor_pulg, stock_actual_m2, stock_minimo_m2 FROM inventario_madera WHERE id = $1',
    [id],
  );
  return rows[0] || null;
}

module.exports = { ESTADOS_VENTA, listar, contadores, madera };
