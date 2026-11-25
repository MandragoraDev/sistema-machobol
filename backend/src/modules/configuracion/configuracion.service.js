const AppError = require('../../utils/AppError');
const configuracionRepository = require('./configuracion.repository');

/** Datos del negocio. Si no se cargaron (falta el seed), es un error de instalación: se informa con claridad. */
async function obtener(client) {
  const configuracion = await configuracionRepository.obtener(client);
  if (!configuracion) {
    throw new AppError(503, 'Faltan los datos del negocio: ejecuta npm run db:seed en el backend.');
  }
  return configuracion;
}

async function actualizar(datos, usuario) {
  const configuracion = await configuracionRepository.actualizar(datos, usuario.id);
  if (!configuracion) {
    throw new AppError(503, 'Faltan los datos del negocio: ejecuta npm run db:seed en el backend.');
  }
  return configuracion;
}

module.exports = { obtener, actualizar };
