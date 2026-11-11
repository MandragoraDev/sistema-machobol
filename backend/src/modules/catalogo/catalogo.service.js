const db = require('../../config/db');
const AppError = require('../../utils/AppError');
const catalogoRepository = require('./catalogo.repository');

/**
 * Fija los precios por m² de una madera para cada tipo de portón (solo Admin).
 * `precios` = { CORREDIZO?: número | null, BATIENTE?: número | null }; null quita el precio y la madera deja
 * de ofrecerse para ese tipo. Los pedidos ya cotizados no cambian: guardan su propio precio.
 */
async function fijarPreciosMadera(maderaId, precios) {
  const { rows: [madera] } = await db.query('SELECT id FROM inventario_madera WHERE id = $1', [maderaId]);
  if (!madera) {
    throw new AppError(404, 'La madera no existe.');
  }
  await db.withTransaction(async (client) => {
    for (const [tipoPorton, precioM2] of Object.entries(precios)) {
      const guardado = await catalogoRepository.guardarPrecio(client, { maderaId, tipoPorton, precioM2 });
      if (!guardado) {
        throw new AppError(409, `No hay un portón ${tipoPorton.toLowerCase()} en el catálogo.`);
      }
    }
  });
  return catalogoRepository.preciosDeMadera(maderaId);
}

module.exports = { fijarPreciosMadera };
