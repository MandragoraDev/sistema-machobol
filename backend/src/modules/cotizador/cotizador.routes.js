const { Router } = require('express');
const { authenticate, authorize } = require('../../middlewares/auth');
const controller = require('./cotizador.controller');

// Cálculo sin guardar nada (vista previa del panel). El pedido se crea en POST /api/pedidos.
const router = Router();

router.use(authenticate, authorize('ADMIN', 'VENTAS'));

router.post('/calcular', controller.calcular);
router.get('/maderas', controller.maderas);

module.exports = router;
