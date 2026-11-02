/** Error operativo con código HTTP; su mensaje se puede mostrar al cliente. */
class AppError extends Error {
  constructor(statusCode, message, detalles) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.detalles = detalles;
  }
}

module.exports = AppError;
