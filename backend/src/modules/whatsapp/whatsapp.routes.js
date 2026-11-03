const { Router } = require('express');
const controller = require('./whatsapp.controller');

// Webhook de la Cloud API de Meta. No usa JWT: cada POST se autentica con su firma HMAC.
const router = Router();

router.get('/', controller.verificar);
router.post('/', controller.recibir);

module.exports = router;
