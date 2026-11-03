const env = require('../config/env');
const AppError = require('../utils/AppError');
const { secretoValido } = require('../utils/secretos');

/** Autenticación servicio a servicio (servidor de acciones de Rasa → backend) con el header X-Service-Token. */
function autenticarServicio(req, res, next) {
  if (!secretoValido(req.get('x-service-token'), env.serviceToken)) {
    throw new AppError(401, 'Token de servicio inválido.');
  }
  next();
}

module.exports = { autenticarServicio };
