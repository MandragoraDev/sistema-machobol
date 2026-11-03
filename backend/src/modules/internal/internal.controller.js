const { validar } = require('../../utils/validar');
const esquemas = require('./internal.schemas');
const internalService = require('./internal.service');

async function catalogo(req, res) {
  res.json(await internalService.catalogo());
}

async function cotizar(req, res) {
  const datos = validar(esquemas.cotizacion, req.body);
  res.json(await internalService.cotizarSimulado(datos));
}

module.exports = { catalogo, cotizar };
