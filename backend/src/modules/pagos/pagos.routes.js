const { Router } = require('express');
const { authenticate, authorize } = require('../../middlewares/auth');
const controller = require('./pagos.controller');

// Pagos recibidos (QR del negocio, efectivo, transferencia o cheque): solo el Admin los registra y los anula.
// La lista y el saldo de cada pedido vienen en su ficha (GET /api/logistica/pedidos/:codigo).
const router = Router();

router.use(authenticate, authorize('ADMIN'));

router.post('/', controller.registrar);
router.post('/:id/anular', controller.anular);

module.exports = router;
