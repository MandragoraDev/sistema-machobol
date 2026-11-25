const { query } = require('../../config/db');

const COLUMNAS = `ciudad, direccion, maps_url, horarios, formas_pago, tiempo_fabricacion, cobertura, anticipo_pct,
  whatsapp_avisos, actualizado_en`;

/** Datos del negocio (una sola fila, id = 1). null si todavía no se cargaron (npm run db:seed). */
async function obtener(client = { query }) {
  const { rows } = await client.query(`SELECT ${COLUMNAS} FROM configuracion_negocio WHERE id = 1`);
  return rows[0] || null;
}

async function actualizar(datos, usuarioId) {
  const { rows } = await query(
    `UPDATE configuracion_negocio
     SET ciudad = $1, direccion = $2, maps_url = $3, horarios = $4, formas_pago = $5, tiempo_fabricacion = $6,
         cobertura = $7, anticipo_pct = $8, whatsapp_avisos = $9, actualizado_por = $10
     WHERE id = 1
     RETURNING ${COLUMNAS}`,
    [datos.ciudad, datos.direccion, datos.maps_url, datos.horarios, datos.formas_pago, datos.tiempo_fabricacion,
      datos.cobertura, datos.anticipo_pct, datos.whatsapp_avisos, usuarioId],
  );
  return rows[0] || null;
}

module.exports = { obtener, actualizar };
