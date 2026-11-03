const { validar } = require('../../utils/validar');
const esquemas = require('./usuarios.schemas');
const usuariosService = require('./usuarios.service');

async function listar(req, res) {
  res.json(await usuariosService.listar());
}

async function crear(req, res) {
  const datos = validar(esquemas.crearUsuario, req.body);
  res.status(201).json(await usuariosService.crear(datos));
}

async function actualizar(req, res) {
  const id = validar(esquemas.idUsuario, req.params.id);
  const cambios = validar(esquemas.actualizarUsuario, req.body);
  res.json(await usuariosService.actualizar(id, cambios, req.usuario));
}

module.exports = { listar, crear, actualizar };
