const { validar } = require('../../utils/validar');
const esquemas = require('./cotizador.schemas');
const cotizadorService = require('./cotizador.service');

async function calcular(req, res) {
  res.json(await cotizadorService.cotizar(validar(esquemas.solicitud, req.body)));
}

async function maderas(req, res) {
  res.json(await cotizadorService.maderasDisponibles(validar(esquemas.consultaMaderas, req.query)));
}

module.exports = { calcular, maderas };
