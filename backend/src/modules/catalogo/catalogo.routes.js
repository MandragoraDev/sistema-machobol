const { Router } = require('express');
const { authenticate, authorize } = require('../../middlewares/auth');
const controller = require('./catalogo.controller');

// Catálogo y precios: solo el Admin los modifica (PLAN §2.5). Los precios se leen junto con el inventario.
const router = Router();

router.put('/precios/:maderaId', authenticate, authorize('ADMIN'), controller.fijarPreciosMadera);

module.exports = router;
