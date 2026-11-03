const { validar } = require('../../utils/validar');
const esquemas = require('./inventario.schemas');
const inventarioService = require('./inventario.service');

async function listar(req, res) {
  const incluirInactivas = req.query.incluir_inactivas === 'true';
  res.json(await inventarioService.listar({ incluirInactivas }));
}

async function crearMadera(req, res) {
  const datos = validar(esquemas.crearMadera, req.body);
  res.status(201).json(await inventarioService.crearMadera(datos));
}

async function actualizarMadera(req, res) {
  const id = validar(esquemas.id, req.params.id);
  const cambios = validar(esquemas.actualizarMadera, req.body);
  res.json(await inventarioService.actualizarMadera(id, cambios));
}

async function registrarIngreso(req, res) {
  const datos = validar(esquemas.ingresoTroca, req.body);
  res.status(201).json(await inventarioService.registrarIngreso(datos, req.usuario));
}

async function registrarAjuste(req, res) {
  const datos = validar(esquemas.ajuste, req.body);
  res.status(201).json(await inventarioService.registrarAjuste(datos, req.usuario));
}

async function listarMovimientos(req, res) {
  const filtros = validar(esquemas.filtrosMovimientos, req.query);
  res.json(await inventarioService.listarMovimientos(filtros));
}

module.exports = {
  listar,
  crearMadera,
  actualizarMadera,
  registrarIngreso,
  registrarAjuste,
  listarMovimientos,
};
