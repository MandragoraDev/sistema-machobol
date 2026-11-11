const { Router } = require('express');
const { authenticate, authorize } = require('../../middlewares/auth');
const controller = require('./pedidos.controller');

// Crear pedidos y ver la proforma: Admin y Ventas. Consultar un pedido: todos los roles (PLAN §2.5).
const router = Router();

router.use(authenticate);

router.post('/', authorize('ADMIN', 'VENTAS'), controller.crear);
router.get('/:codigo', controller.obtener);
router.get('/:codigo/proforma', authorize('ADMIN', 'VENTAS'), controller.proforma);

module.exports = router;
