const { query } = require('../../config/db');

async function productoPorTipo(tipoPorton) {
  const { rows } = await query(
    `SELECT id, nombre, tipo_porton, modo_precio, factor_consumo, merma_pct
     FROM productos
     WHERE activo AND modo_precio = 'POR_M2' AND tipo_porton = $1
     ORDER BY id
     LIMIT 1`,
    [tipoPorton],
  );
  return rows[0] || null;
}

/** La madera y su precio por m² para ese producto (precio_m2 es null si el Admin no lo definió). */
async function maderaConPrecio(productoId, maderaId) {
  const { rows } = await query(
    `SELECT m.id, m.especie, m.espesor_pulg, m.stock_actual_m2, m.activo, pp.precio_m2
     FROM inventario_madera m
     LEFT JOIN precios_porton pp ON pp.madera_id = m.id AND pp.producto_id = $1
     WHERE m.id = $2`,
    [productoId, maderaId],
  );
  return rows[0] || null;
}

/** Maderas activas que tienen precio para ese producto: las que se le ofrecen al cliente. */
async function maderasConPrecio(productoId) {
  const { rows } = await query(
    `SELECT m.id, m.especie, m.espesor_pulg, m.stock_actual_m2, pp.precio_m2
     FROM precios_porton pp
     JOIN inventario_madera m ON m.id = pp.madera_id
     WHERE pp.producto_id = $1 AND m.activo
     ORDER BY m.especie, m.espesor_pulg`,
    [productoId],
  );
  return rows;
}

async function accesoriosActivosPorCodigo(codigos) {
  const { rows } = await query(
    `SELECT id, codigo, nombre, tipo_adicional, precio, tipo_porton_compatible
     FROM accesorios
     WHERE activo AND codigo = ANY($1::text[])
     ORDER BY id`,
    [codigos],
  );
  return rows;
}

module.exports = { productoPorTipo, maderaConPrecio, maderasConPrecio, accesoriosActivosPorCodigo };
