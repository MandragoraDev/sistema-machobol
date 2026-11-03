const { z, decimal } = require('../../utils/validar');

// Contrato del bot con el cotizador. El cálculo real del Sprint 4 recibirá estos mismos datos.
// Los recargos (transporte) no se piden por código: el backend los aplica según `fuera_ciudad`.
const cotizacion = z.object({
  wa_id: z.string().regex(/^\d{8,15}$/, 'Debe ser un número de WhatsApp (solo dígitos)'),
  tipo_porton: z.enum(['CORREDIZO', 'BATIENTE']),
  ancho_m: decimal(2, { min: 0.01, max: 999.99 }),
  alto_m: decimal(2, { min: 0.01, max: 999.99 }),
  accesorios: z.array(z.string().trim().toUpperCase().max(40)).max(10).default([]),
  fuera_ciudad: z.boolean(),
});

module.exports = { cotizacion };
