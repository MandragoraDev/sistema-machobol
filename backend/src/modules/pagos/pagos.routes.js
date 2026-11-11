const { Router } = require('express');
const { authenticate, authorize } = require('../../middlewares/auth');
const { autenticarServicio } = require('../../middlewares/servicio');
const controller = require('./pagos.controller');

// Panel: generar el QR de cobro de un pedido (Admin y Ventas).
const pagos = Router();
pagos.post('/qr', authenticate, authorize('ADMIN', 'VENTAS'), controller.crearQr);

// Callback de la pasarela (sin JWT: se autentica con su firma HMAC).
const webhook = Router();
webhook.post('/', controller.callback);

// Solo fuera de producción: simula que el cliente pagó (o que el banco rechazó) un QR.
// Lo usan los simuladores de desarrollo, con el token de servicio.
const dev = Router();
dev.post('/pagos/:id/simular', autenticarServicio, controller.simular);

module.exports = { pagos, webhook, dev };
