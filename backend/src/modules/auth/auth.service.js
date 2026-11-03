const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const env = require('../../config/env');
const AppError = require('../../utils/AppError');
const usuariosRepository = require('../usuarios/usuarios.repository');

// Si el correo no existe se compara contra este hash igualmente: así el tiempo de respuesta
// no revela qué correos están registrados.
const HASH_RELLENO = '$2b$12$z0js7wkLbK7CxedO4nz0fubr0KHvTyGwX4ZYBlfiCT3fBCLMUs97G';

/** El token lleva el id (sub), el nombre y el rol: el panel lee el rol para armar el menú y el Dashboard. */
function firmarToken(usuario) {
  return jwt.sign({ nombre: usuario.nombre, rol: usuario.rol }, env.jwtSecret, {
    subject: String(usuario.id),
    expiresIn: env.jwtExpiraEn,
    algorithm: 'HS256',
  });
}

async function iniciarSesion({ email, password }) {
  const credenciales = await usuariosRepository.buscarCredenciales(email);
  const coincide = await bcrypt.compare(password, credenciales?.password_hash ?? HASH_RELLENO);
  if (!credenciales || !coincide) {
    throw new AppError(401, 'Correo o contraseña incorrectos.');
  }

  const { password_hash: _hash, ...usuario } = credenciales;
  if (!usuario.activo) {
    throw new AppError(403, 'Tu cuenta está desactivada. Contacta al administrador.');
  }
  return { token: firmarToken(usuario), usuario };
}

module.exports = { firmarToken, iniciarSesion };
