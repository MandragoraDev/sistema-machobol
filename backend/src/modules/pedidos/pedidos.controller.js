const { validar } = require('../../utils/validar');
const esquemas = require('./pedidos.schemas');
const pedidosService = require('./pedidos.service');

async function crear(req, res) {
  const { cliente_id, observaciones, ...solicitud } = validar(esquemas.crearPedido, req.body);
  const pedido = await pedidosService.crearPedido(solicitud, {
    clienteId: cliente_id,
    canal: 'PANEL',
    usuarioId: req.usuario.id,
    observaciones: observaciones ?? null,
  });
  res.status(201).json(pedido);
}

async function obtener(req, res) {
  res.json(await pedidosService.obtener(validar(esquemas.codigo, req.params.codigo)));
}

async function proforma(req, res) {
  const pedido = await pedidosService.obtener(validar(esquemas.codigo, req.params.codigo));
  const { buffer, nombre } = await pedidosService.proformaPdf(pedido);
  res.type('application/pdf').set('Content-Disposition', `inline; filename="${nombre}"`).send(buffer);
}

module.exports = { crear, obtener, proforma };
