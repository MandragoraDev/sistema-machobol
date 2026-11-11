const { Router } = require('express');
const { autenticarServicio } = require('../../middlewares/servicio');
const controller = require('./internal.controller');

// API para el servidor de acciones de Rasa. No acepta JWT de usuarios: solo el token de servicio.
const router = Router();

router.use(autenticarServicio);

router.get('/catalogo', controller.catalogo);
router.get('/maderas', controller.maderas);
router.post('/cotizaciones', controller.cotizar);
router.post('/pedidos/:codigo/pago-qr', controller.crearPagoQr);

module.exports = router;
