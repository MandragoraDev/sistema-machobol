const jwt = require('jsonwebtoken');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const usuariosRepository = require('../modules/usuarios/usuarios.repository');

/**
 * Exige un JWT válido en `Authorization: Bearer <token>`.
 * Además del token, comprueba en la BD que el usuario siga activo y toma su rol actual:
 * si el Admin desactiva a alguien o le cambia el rol, el efecto es inmediato.
 */
async function authenticate(req, res, next) {
  const [esquema, token] = (req.get('authorization') || '').split(' ');
  if (esquema !== 'Bearer' || !token) {
    throw new AppError(401, 'Debes iniciar sesión.');
  }

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    throw new AppError(401, 'La sesión expiró o no es válida. Inicia sesión de nuevo.');
  }

  const usuario = await usuariosRepository.buscarPorId(Number(payload.sub));
  if (!usuario || !usuario.activo) {
    throw new AppError(401, 'La sesión expiró o no es válida. Inicia sesión de nuevo.');
  }

  req.usuario = usuario;
  next();
}

/** Restringe la ruta a los roles indicados. Debe ir después de `authenticate`. */
function authorize(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.usuario.rol)) {
      throw new AppError(403, 'No tienes permiso para realizar esta acción.');
    }
    next();
  };
}

module.exports = { authenticate, authorize };
