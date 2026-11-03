const { Router } = require('express');
const { authenticate, authorize } = require('../../middlewares/auth');
const controller = require('./usuarios.controller');

// Gestión de usuarios: exclusiva del Admin.
const router = Router();

router.use(authenticate, authorize('ADMIN'));

router.get('/', controller.listar);
router.post('/', controller.crear);
router.patch('/:id', controller.actualizar);

module.exports = router;
