const { z, validar } = require('../../utils/validar');
const authService = require('./auth.service');

const esquemaLogin = z.object({
  email: z.string().trim().toLowerCase().min(1, 'Ingresa tu correo'),
  password: z.string().min(1, 'Ingresa tu contraseña'),
});

async function login(req, res) {
  const credenciales = validar(esquemaLogin, req.body);
  res.json(await authService.iniciarSesion(credenciales));
}

function perfil(req, res) {
  res.json({ usuario: req.usuario });
}

module.exports = { login, perfil };
