const AppError = require('../utils/AppError');
const { traducirErrorBD } = require('../utils/erroresBD');

function notFound(req, res, next) {
  next(new AppError(404, `Ruta no encontrada: ${req.method} ${req.originalUrl}`));
}

// Express solo reconoce un manejador de errores si declara los 4 parámetros.
function errorHandler(err, req, res, next) {
  const error = traducirErrorBD(err) || err;
  const status = error.statusCode || error.status || 500;

  if (status >= 500) {
    req.log.error({ err }, 'Error no controlado');
    return res.status(500).json({ error: 'Error interno del servidor' });
  }

  return res.status(status).json({
    error: error.message,
    ...(error.detalles && { detalles: error.detalles }),
  });
}

module.exports = { notFound, errorHandler };
