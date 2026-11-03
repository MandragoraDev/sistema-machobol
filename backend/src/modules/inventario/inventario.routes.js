const { Router } = require('express');
const { authenticate, authorize } = require('../../middlewares/auth');
const controller = require('./inventario.controller');

// Lectura: todos los roles. Ingreso de trocas: Admin y Taller. Ajustes y catálogo de maderas: solo Admin.
const router = Router();

router.use(authenticate);

router.get('/', controller.listar);
router.get('/movimientos', controller.listarMovimientos);
router.post('/', authorize('ADMIN'), controller.crearMadera);
router.patch('/:id', authorize('ADMIN'), controller.actualizarMadera);
router.post('/ingresos', authorize('ADMIN', 'TALLER'), controller.registrarIngreso);
router.post('/ajustes', authorize('ADMIN'), controller.registrarAjuste);

module.exports = router;
