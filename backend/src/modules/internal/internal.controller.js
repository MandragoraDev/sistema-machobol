const { validar } = require('../../utils/validar');
const esquemas = require('./internal.schemas');
const internalService = require('./internal.service');

async function catalogo(req, res) {
  res.json(await internalService.catalogo());
}

async function cotizar(req, res) {
  res.status(201).json(await internalService.cotizar(validar(esquemas.cotizacion, req.body)));
}

async function maderas(req, res) {
  res.json(await internalService.maderas(validar(esquemas.consultaMaderas, req.query)));
}

async function crearPagoQr(req, res) {
  const codigo = validar(esquemas.codigo, req.params.codigo);
  res.json(await internalService.crearPagoQr(codigo, validar(esquemas.pagoQr, req.body)));
}

module.exports = { catalogo, cotizar, maderas, crearPagoQr };
