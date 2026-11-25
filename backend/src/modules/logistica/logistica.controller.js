const { validar } = require('../../utils/validar');
const { codigo: esquemaCodigo } = require('../pedidos/pedidos.schemas');
const esquemas = require('./logistica.schemas');
const logisticaService = require('./logistica.service');
const ventasService = require('../ventas/ventas.service');

const codigo = (req) => validar(esquemaCodigo, req.params.codigo);

async function tablero(req, res) {
  res.json(await logisticaService.tablero());
}

async function detalle(req, res) {
  res.json(await logisticaService.detalle(codigo(req)));
}

async function avanzar(req, res) {
  const { desde, observacion } = validar(esquemas.avanzar, req.body);
  res.json(await logisticaService.mover(codigo(req), { accion: 'avanzar', desde, motivo: observacion }, req.usuario));
}

async function retroceder(req, res) {
  const { desde, motivo } = validar(esquemas.retroceder, req.body);
  res.json(await logisticaService.mover(codigo(req), { accion: 'retroceder', desde, motivo }, req.usuario));
}

async function programarInstalacion(req, res) {
  const { fecha_instalacion } = validar(esquemas.instalacion, req.body);
  res.json(await logisticaService.programarInstalacion(codigo(req), fecha_instalacion));
}

/** Pedido en revisión de stock (anticipo cubierto, faltaba madera): se reintenta tras reponerla. */
async function reintentarProduccion(req, res) {
  await ventasService.iniciarProduccion(codigo(req), req.usuario);
  res.json(await logisticaService.detalle(codigo(req)));
}

module.exports = { tablero, detalle, avanzar, retroceder, programarInstalacion, reintentarProduccion };
