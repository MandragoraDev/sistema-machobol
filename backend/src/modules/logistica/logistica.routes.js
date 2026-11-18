const { Router } = require('express');
const { authenticate, authorize } = require('../../middlewares/auth');
const controller = require('./logistica.controller');

// Calendario logístico y trazabilidad (R-13). Ver: todos los roles. Avanzar y programar la instalación: Admin y Taller.
// Retroceder (con motivo) y reintentar la producción de un pedido sin madera: solo Admin (PLAN §2.5).
const router = Router();

router.use(authenticate);

router.get('/tablero', controller.tablero);
router.get('/pedidos/:codigo', controller.detalle);
router.post('/pedidos/:codigo/avanzar', authorize('ADMIN', 'TALLER'), controller.avanzar);
router.post('/pedidos/:codigo/retroceder', authorize('ADMIN'), controller.retroceder);
router.patch('/pedidos/:codigo/instalacion', authorize('ADMIN', 'TALLER'), controller.programarInstalacion);
router.post('/pedidos/:codigo/reintentar-produccion', authorize('ADMIN'), controller.reintentarProduccion);

module.exports = router;
