const AppError = require('./AppError');

// Mensajes para las restricciones con nombre del esquema (ver migraciones).
const MENSAJES = {
  uq_usuarios_email: 'Ya existe un usuario con ese correo.',
  uq_inventario_madera_especie_espesor: 'Ya existe una madera con esa especie y espesor.',
  ck_inventario_madera_stock_no_negativo: 'Stock insuficiente: la operación dejaría el stock en negativo.',
};

const CODIGOS_PG = {
  23505: 409, // unique_violation
  23514: 409, // check_violation
  23503: 409, // foreign_key_violation
  22003: 400, // numeric_value_out_of_range
};

/** Convierte un error de PostgreSQL conocido en un AppError; devuelve null si no lo es. */
function traducirErrorBD(err) {
  const status = CODIGOS_PG[err.code];
  if (!status) return null;
  const mensaje = MENSAJES[err.constraint]
    || (err.code === '22003' ? 'Un valor numérico excede el máximo permitido.' : 'La operación viola una regla de integridad de los datos.');
  return new AppError(status, mensaje);
}

module.exports = { traducirErrorBD };
