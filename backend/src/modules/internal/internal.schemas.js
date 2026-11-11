const { z } = require('../../utils/validar');
const { solicitud, consultaMaderas } = require('../cotizador/cotizador.schemas');
const { codigo } = require('../pedidos/pedidos.schemas');

const waId = z.string().regex(/^\d{8,15}$/, 'Debe ser un número de WhatsApp (solo dígitos)');

// El bot cotiza en nombre del cliente que conversa (wa_id) y con su misma solicitud que el panel.
const cotizacion = solicitud.extend({ wa_id: waId });

const pagoQr = z.object({ wa_id: waId });

module.exports = { cotizacion, consultaMaderas, pagoQr, codigo };
