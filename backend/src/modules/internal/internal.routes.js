const { Router } = require('express');
const { autenticarServicio } = require('../../middlewares/servicio');
const controller = require('./internal.controller');

// API para el servidor de acciones de Rasa. No acepta JWT de usuarios: solo el token de servicio.
const router = Router();

router.use(autenticarServicio);

router.get('/catalogo', controller.catalogo);
router.post('/cotizaciones', controller.cotizar);

module.exports = router;
