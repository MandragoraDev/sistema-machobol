const { Router } = require('express');
const { authenticate, authorize } = require('../../middlewares/auth');
const { validar } = require('../../utils/validar');
const { codigo: esquemaCodigo } = require('../pedidos/pedidos.schemas');
const logisticaService = require('../logistica/logistica.service');
const esquemas = require('./ventas.schemas');
const ventasService = require('./ventas.service');

// Embudo de venta (PLAN §2.5): Admin y Ventas ven las cotizaciones y agendan reuniones.
// Acordar el precio e iniciar la producción: solo el Admin (los pagos también los registra él, en /api/pagos).
const router = Router();

router.use(authenticate, authorize('ADMIN', 'VENTAS'));

const codigo = (req) => validar(esquemaCodigo, req.params.codigo);

router.get('/pedidos', async (req, res) => {
  res.json(await ventasService.listar(validar(esquemas.filtro, req.query)));
});

router.get('/resumen', async (req, res) => {
  res.json(await ventasService.resumen());
});

router.patch('/pedidos/:codigo/reunion', async (req, res) => {
  await ventasService.agendarReunion(codigo(req), validar(esquemas.reunion, req.body), req.usuario);
  res.json(await logisticaService.detalle(codigo(req)));
});

router.patch('/pedidos/:codigo/precio', authorize('ADMIN'), async (req, res) => {
  await ventasService.acordarPrecio(codigo(req), validar(esquemas.precio, req.body), req.usuario);
  res.json(await logisticaService.detalle(codigo(req)));
});

router.post('/pedidos/:codigo/iniciar-produccion', authorize('ADMIN'), async (req, res) => {
  const { resultado, mensaje } = await ventasService.iniciarProduccion(codigo(req), req.usuario);
  res.json({ resultado, mensaje, pedido: await logisticaService.detalle(codigo(req)) });
});

module.exports = router;
