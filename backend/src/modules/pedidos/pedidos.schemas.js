const { z } = require('../../utils/validar');
const { solicitud } = require('../cotizador/cotizador.schemas');

const codigo = z.string().trim().toUpperCase().regex(/^MCH-\d{4}-\d{4,}$/, 'Código de pedido inválido (MCH-AAAA-NNNN)');

const crearPedido = solicitud.extend({
  cliente_id: z.number().int().positive(),
  observaciones: z.string().trim().max(500).optional(),
});

module.exports = { codigo, crearPedido };
