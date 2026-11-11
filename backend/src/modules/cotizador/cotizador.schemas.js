const { z, decimal } = require('../../utils/validar');

const tipoPorton = z.enum(['CORREDIZO', 'BATIENTE']);

// Solicitud de cotización de un portón: la misma desde el panel y desde el asistente de WhatsApp.
// El precio por m² depende de la madera elegida. El transporte no se pide como accesorio: se aplica según `fuera_ciudad`.
const solicitud = z.object({
  tipo_porton: tipoPorton,
  madera_id: z.number({ error: 'Elige la madera' }).int().positive(),
  ancho_m: decimal(2, { min: 0.01, max: 999.99, mensaje: 'Ingresa el ancho en metros' }),
  alto_m: decimal(2, { min: 0.01, max: 999.99, mensaje: 'Ingresa el alto en metros' }),
  accesorios: z.array(z.string().trim().toUpperCase().max(40)).max(10).default([]),
  fuera_ciudad: z.boolean().default(false),
});

// Consulta de maderas para ofrecer (query string). Con las medidas, también informa si alcanza el stock.
const consultaMaderas = z.object({
  tipo_porton: z.string().trim().toUpperCase().pipe(tipoPorton),
  ancho_m: z.coerce.number().positive().max(999.99).optional(),
  alto_m: z.coerce.number().positive().max(999.99).optional(),
});

module.exports = { solicitud, consultaMaderas };
