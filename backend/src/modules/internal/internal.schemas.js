const { z } = require('../../utils/validar');
const { solicitud, consultaMaderas } = require('../cotizador/cotizador.schemas');
const { codigo } = require('../pedidos/pedidos.schemas');

const waId = z.string().regex(/^\d{8,15}$/, 'Debe ser un número de WhatsApp (solo dígitos)');

// El bot cotiza en nombre del cliente que conversa (wa_id) y con su misma solicitud que el panel.
const cotizacion = solicitud.extend({ wa_id: waId });

// El cliente que conversa acepta la cotización y pide una reunión (con el día y horario que le convienen).
const reunion = z.object({ wa_id: waId, preferencia: z.string().trim().max(300).optional() });

const consultaEstado = z.object({ wa_id: waId, codigo: codigo.optional() });

module.exports = { cotizacion, consultaMaderas, reunion, consultaEstado, codigo };
