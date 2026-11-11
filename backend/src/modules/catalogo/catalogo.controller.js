const { validar } = require('../../utils/validar');
const esquemas = require('./catalogo.schemas');
const catalogoService = require('./catalogo.service');

async function fijarPreciosMadera(req, res) {
  const maderaId = validar(esquemas.id, req.params.maderaId);
  res.json(await catalogoService.fijarPreciosMadera(maderaId, validar(esquemas.preciosMadera, req.body)));
}

module.exports = { fijarPreciosMadera };
