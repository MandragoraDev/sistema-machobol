const { Router } = require('express');
const { rateLimit } = require('express-rate-limit');
const { authenticate } = require('../../middlewares/auth');
const controller = require('./auth.controller');

// Frena la fuerza bruta: 10 intentos fallidos por IP cada 15 minutos (los exitosos no cuentan).
const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos fallidos. Espera 15 minutos e inténtalo de nuevo.' },
});

const router = Router();

router.post('/login', limiteLogin, controller.login);
router.get('/me', authenticate, controller.perfil);

module.exports = router;
