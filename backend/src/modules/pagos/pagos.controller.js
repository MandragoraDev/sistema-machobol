const { validar } = require('../../utils/validar');
const esquemas = require('./pagos.schemas');
const pagosService = require('./pagos.service');

async function registrar(req, res) {
  const datos = validar(esquemas.registrar, req.body);
  res.status(201).json({ pedido: datos.pedido, ...(await pagosService.registrar(datos, req.usuario)) });
}

async function anular(req, res) {
  const id = validar(esquemas.id, req.params.id);
  res.json(await pagosService.anular(id, validar(esquemas.anular, req.body), req.usuario));
}

module.exports = { registrar, anular };
