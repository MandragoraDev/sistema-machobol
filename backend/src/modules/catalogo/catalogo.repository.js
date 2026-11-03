const { query } = require('../../config/db');

async function listarCategorias() {
  const { rows } = await query('SELECT id, nombre FROM categorias_producto ORDER BY id');
  return rows;
}

async function listarProductosActivos() {
  const { rows } = await query(
    `SELECT categoria_id, nombre, tipo_porton, modo_precio, precio_m2, precio_fijo
     FROM productos
     WHERE activo
     ORDER BY categoria_id, id`,
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

module.exports = { listarCategorias, listarProductosActivos, listarAccesoriosActivos };
