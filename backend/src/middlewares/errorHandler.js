const AppError = require('../utils/AppError');

function notFound(req, res, next) {
  next(new AppError(404, `Ruta no encontrada: ${req.method} ${req.originalUrl}`));
}

// Express solo reconoce un manejador de errores si declara los 4 parámetros.
function errorHandler(err, req, res, next) {
  const status = err.statusCode || err.status || 500;

  if (status >= 500) {
    req.log.error({ err }, 'Error no controlado');
    return res.status(500).json({ error: 'Error interno del servidor' });
  }

  return res.status(status).json({
    error: err.message,
    ...(err.detalles && { detalles: err.detalles }),
  });
}

module.exports = { notFound, errorHandler };
