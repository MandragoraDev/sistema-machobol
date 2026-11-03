const { Router } = require('express');
const healthRoutes = require('./modules/health/health.routes');
const authRoutes = require('./modules/auth/auth.routes');
const usuariosRoutes = require('./modules/usuarios/usuarios.routes');
const inventarioRoutes = require('./modules/inventario/inventario.routes');

// Punto único donde cada módulo monta su router bajo /api.
const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/usuarios', usuariosRoutes);
router.use('/inventario', inventarioRoutes);

module.exports = router;
