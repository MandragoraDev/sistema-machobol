const { Router } = require('express');
const healthRoutes = require('./modules/health/health.routes');
const authRoutes = require('./modules/auth/auth.routes');
const usuariosRoutes = require('./modules/usuarios/usuarios.routes');
const inventarioRoutes = require('./modules/inventario/inventario.routes');
const whatsappRoutes = require('./modules/whatsapp/whatsapp.routes');
const internalRoutes = require('./modules/internal/internal.routes');
const cotizadorRoutes = require('./modules/cotizador/cotizador.routes');
const pedidosRoutes = require('./modules/pedidos/pedidos.routes');
const pagosRoutes = require('./modules/pagos/pagos.routes');
const catalogoRoutes = require('./modules/catalogo/catalogo.routes');
const logisticaRoutes = require('./modules/logistica/logistica.routes');
const ventasRoutes = require('./modules/ventas/ventas.routes');
const configuracionRoutes = require('./modules/configuracion/configuracion.routes');

// Punto único donde cada módulo monta su router bajo /api.
const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/usuarios', usuariosRoutes);
router.use('/inventario', inventarioRoutes);
router.use('/webhooks/whatsapp', whatsappRoutes);
router.use('/internal', internalRoutes);
router.use('/catalogo', catalogoRoutes);
router.use('/cotizaciones', cotizadorRoutes);
router.use('/pedidos', pedidosRoutes);
router.use('/pagos', pagosRoutes);
router.use('/ventas', ventasRoutes);
router.use('/logistica', logisticaRoutes);
router.use('/configuracion', configuracionRoutes);

module.exports = router;
