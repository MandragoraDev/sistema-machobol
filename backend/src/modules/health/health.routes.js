const { Router } = require('express');
const { verificarSalud } = require('./health.controller');

const router = Router();

router.get('/', verificarSalud);

module.exports = router;
