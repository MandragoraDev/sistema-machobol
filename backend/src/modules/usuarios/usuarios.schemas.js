const { z } = require('../../utils/validar');

const ROLES = ['ADMIN', 'VENTAS', 'TALLER'];

const nombre = z.string().trim().min(2, 'Ingresa el nombre (mínimo 2 caracteres)').max(120);
const email = z.string().trim().toLowerCase().max(160).pipe(z.email('Ingresa un correo electrónico válido'));
// bcrypt solo considera los primeros 72 bytes de la contraseña.
const password = z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(72, 'La contraseña admite como máximo 72 caracteres');
const rol = z.enum(ROLES, { error: 'Rol no válido' });

const crearUsuario = z.object({ nombre, email, password, rol });

const actualizarUsuario = z
  .object({ nombre, email, password, rol, activo: z.boolean() })
  .partial()
  .refine((cambios) => Object.keys(cambios).length > 0, 'No hay cambios que guardar');

const idUsuario = z.coerce.number().int().positive();

module.exports = { ROLES, crearUsuario, actualizarUsuario, idUsuario };
