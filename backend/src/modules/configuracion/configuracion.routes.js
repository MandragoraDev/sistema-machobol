const { Router } = require('express');
const { authenticate, authorize } = require('../../middlewares/auth');
const { validar } = require('../../utils/validar');
const esquemas = require('./configuracion.schemas');
const configuracionService = require('./configuracion.service');

// Datos del negocio que responde el bot y WhatsApp del encargado: los ven todos los roles, solo el Admin los cambia.
const router = Router();

router.use(authenticate);

router.get('/', async (req, res) => {
  res.json(await configuracionService.obtener());
});

router.put('/', authorize('ADMIN'), async (req, res) => {
  res.json(await configuracionService.actualizar(validar(esquemas.configuracion, req.body), req.usuario));
});

module.exports = router;
