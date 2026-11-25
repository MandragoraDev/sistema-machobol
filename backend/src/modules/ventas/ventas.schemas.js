const { z, decimal } = require('../../utils/validar');
const { ESTADOS_VENTA } = require('./ventas.repository');

const filtro = z.object({
  estado: z.enum(ESTADOS_VENTA).optional(),
});

// Fecha y hora de la reunión (ISO 8601, con zona horaria; el panel envía la hora de Bolivia).
const reunion = z.object({
  fecha_reunion: z.iso.datetime({ offset: true, error: 'Fecha y hora inválidas' }),
});

const precio = z.object({
  total_final: decimal(2, { min: 0.01, max: 9_999_999_999.99, mensaje: 'Ingresa el precio acordado en Bs' }),
  motivo: z.string({ error: 'Explica el cambio de precio' }).trim().min(5, 'Explica el cambio de precio (mínimo 5 caracteres)').max(500),
});

const solicitudReunion = z.object({
  preferencia: z.string().trim().max(300).optional(),
});

module.exports = { filtro, reunion, precio, solicitudReunion };
