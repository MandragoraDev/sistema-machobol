const bcrypt = require('bcrypt');
const AppError = require('../../utils/AppError');
const usuariosRepository = require('./usuarios.repository');

const BCRYPT_COSTO = 12;

function hashearPassword(password) {
  return bcrypt.hash(password, BCRYPT_COSTO);
}

function listar() {
  return usuariosRepository.listar();
}

async function crear({ password, ...datos }) {
  return usuariosRepository.crear({ ...datos, passwordHash: await hashearPassword(password) });
}

/** `actor` es el Admin que hace el cambio: no puede bloquearse a sí mismo el acceso. */
async function actualizar(id, { password, ...cambios }, actor) {
  const quitaseAcceso = cambios.activo === false || (cambios.rol && cambios.rol !== 'ADMIN');
  if (id === actor.id && quitaseAcceso) {
    throw new AppError(409, 'No puedes desactivar tu propia cuenta ni quitarte el rol de Administrador.');
  }
  if (password) {
    cambios.password_hash = await hashearPassword(password);
  }

  const usuario = await usuariosRepository.actualizar(id, cambios);
  if (!usuario) {
    throw new AppError(404, 'El usuario no existe.');
  }
  return usuario;
}

module.exports = { hashearPassword, listar, crear, actualizar };
