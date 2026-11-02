const { Router } = require('express');
const healthRoutes = require('./modules/health/health.routes');

// Punto único donde cada módulo monta su router bajo /api.
const router = Router();

router.use('/health', healthRoutes);

module.exports = router;
