const { query } = require('../../config/db');

async function listarCategorias() {
  const { rows } = await query('SELECT id, nombre FROM categorias_producto ORDER BY id');
  return rows;
}

async function listarProductosActivos() {
  const { rows } = await query(
    `SELECT id, categoria_id, nombre, tipo_porton, modo_precio, precio_fijo
     FROM productos
     WHERE activo
     ORDER BY categoria_id, id`,
  );
  return rows;
}

/** Precios por m² de cada portón según la madera (solo maderas activas). */
async function listarPreciosPorton() {
  const { rows } = await query(
    `SELECT pp.producto_id, m.id AS madera_id, m.especie, m.espesor_pulg, pp.precio_m2
     FROM precios_porton pp
     JOIN inventario_madera m ON m.id = pp.madera_id
     WHERE m.activo
     ORDER BY m.especie, m.espesor_pulg`,
  );
  return rows;
}

async function listarAccesoriosActivos() {
  const { rows } = await query(
    `SELECT codigo, nombre, tipo_adicional, precio, tipo_porton_compatible
     FROM accesorios
     WHERE activo
     ORDER BY tipo_adicional, id`,
  );
  return rows;
}

/** Fija (o, con precio null, quita) el precio por m² de una madera para el portón de ese tipo. */
async function guardarPrecio(client, { maderaId, tipoPorton, precioM2 }) {
  const { rows: [producto] } = await client.query(
    "SELECT id FROM productos WHERE modo_precio = 'POR_M2' AND tipo_porton = $1 ORDER BY id LIMIT 1",
    [tipoPorton],
  );
  if (!producto) return false;
  if (precioM2 === null) {
    await client.query('DELETE FROM precios_porton WHERE producto_id = $1 AND madera_id = $2', [producto.id, maderaId]);
  } else {
    await client.query(
      `INSERT INTO precios_porton (producto_id, madera_id, precio_m2) VALUES ($1, $2, $3)
       ON CONFLICT (producto_id, madera_id) DO UPDATE SET precio_m2 = EXCLUDED.precio_m2`,
      [producto.id, maderaId, precioM2],
    );
  }
  return true;
}

/** { CORREDIZO: '2470.00', BATIENTE: '2500.00' } de una madera. */
async function preciosDeMadera(maderaId) {
  const { rows } = await query(
    `SELECT pr.tipo_porton, pp.precio_m2
     FROM precios_porton pp JOIN productos pr ON pr.id = pp.producto_id
     WHERE pp.madera_id = $1`,
    [maderaId],
  );
  return Object.fromEntries(rows.map((r) => [r.tipo_porton, r.precio_m2]));
}

module.exports = {
  listarCategorias,
  listarProductosActivos,
  listarPreciosPorton,
  listarAccesoriosActivos,
  guardarPrecio,
  preciosDeMadera,
};
