const { validar } = require('../../utils/validar');
const esquemas = require('./pagos.schemas');
const pagosService = require('./pagos.service');
const pasarela = require('./pasarela');

async function crearQr(req, res) {
  const { pedido } = validar(esquemas.crearQr, req.body);
  const cobro = await pagosService.crearCobroQr(pedido);
  res.status(cobro.nuevo ? 201 : 200).json(await pagosService.presentarCobro(cobro));
}

/** Callback de la pasarela: se acepta solo con firma válida y se procesa en la transacción ACID. */
async function callback(req, res) {
  const evento = pasarela.verificarCallback(req.cuerpoCrudo, req.get(pasarela.CABECERA_FIRMA));
  res.json(await pagosService.procesarCallback(evento));
}

async function simular(req, res) {
  const id = validar(esquemas.id, req.params.id);
  const { estado } = validar(esquemas.simulacion, req.body ?? {});
  res.json(await pagosService.simularPago(id, estado));
}

module.exports = { crearQr, callback, simular };
