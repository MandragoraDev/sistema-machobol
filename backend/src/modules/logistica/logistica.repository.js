const { query } = require('../../config/db');

// Los entregados se muestran durante este tiempo; después solo se consultan por código.
const DIAS_VISIBLES_ENTREGADOS = 30;

async function fases() {
  const { rows } = await query('SELECT orden, nombre FROM fases_produccion ORDER BY orden');
  return rows;
}

/** Pedidos pagados: en producción, en ruta, entregados recientes y los que esperan madera (revisión de stock). */
async function tablero() {
  const { rows } = await query(
    `SELECT p.codigo, e.codigo AS estado, e.nombre AS estado_nombre, f.orden AS fase, f.nombre AS fase_nombre,
            c.nombre AS cliente, c.wa_id, pr.tipo_porton, m.especie AS madera_especie, m.espesor_pulg AS madera_espesor_pulg,
            p.ancho_m, p.alto_m, p.total_final, to_char(p.fecha_instalacion, 'YYYY-MM-DD') AS fecha_instalacion,
            (SELECT COALESCE(q.confirmado_en, q.actualizado_en)
             FROM pagos_qr q
             WHERE q.pedido_id = p.id AND q.estado IN ('CONFIRMADO', 'REVISION')
             ORDER BY q.confirmado_en NULLS LAST, q.id
             LIMIT 1) AS pagado_en,
            ultimo.creado_en AS en_etapa_desde
     FROM pedidos p
     JOIN estados_pedido e ON e.id = p.estado_id
     JOIN clientes c ON c.id = p.cliente_id
     JOIN productos pr ON pr.id = p.producto_id
     LEFT JOIN fases_produccion f ON f.id = p.fase_actual_id
     LEFT JOIN inventario_madera m ON m.id = p.madera_id
     LEFT JOIN LATERAL (
       SELECT h.creado_en FROM historial_pedido h WHERE h.pedido_id = p.id ORDER BY h.id DESC LIMIT 1
     ) ultimo ON true
     WHERE e.codigo IN ('EN_PRODUCCION', 'EN_RUTA', 'REVISION_STOCK')
        OR (e.codigo = 'ENTREGADO' AND ultimo.creado_en > now() - make_interval(days => $1))
     ORDER BY p.fecha_instalacion NULLS LAST, p.id`,
    [DIAS_VISIBLES_ENTREGADOS],
  );
  return rows;
}

/** Historial inmutable del pedido, del más antiguo al más reciente. */
async function historial(codigo) {
  const { rows } = await query(
    `SELECT h.id, h.creado_en,
            ea.codigo AS estado_anterior, ea.nombre AS estado_anterior_nombre,
            en.codigo AS estado_nuevo, en.nombre AS estado_nuevo_nombre,
            fa.orden AS fase_anterior, fa.nombre AS fase_anterior_nombre,
            fn.orden AS fase_nueva, fn.nombre AS fase_nueva_nombre,
            u.nombre AS usuario, u.rol AS usuario_rol, h.motivo
     FROM historial_pedido h
     JOIN pedidos p ON p.id = h.pedido_id
     JOIN estados_pedido en ON en.id = h.estado_nuevo_id
     LEFT JOIN estados_pedido ea ON ea.id = h.estado_anterior_id
     LEFT JOIN fases_produccion fa ON fa.id = h.fase_anterior_id
     LEFT JOIN fases_produccion fn ON fn.id = h.fase_nueva_id
     LEFT JOIN usuarios u ON u.id = h.usuario_id
     WHERE p.codigo = $1
     ORDER BY h.id`,
    [codigo],
  );
  return rows;
}

module.exports = { DIAS_VISIBLES_ENTREGADOS, fases, tablero, historial };
