const { z } = require('../../utils/validar');
const { codigo } = require('../pedidos/pedidos.schemas');

const id = z.coerce.number().int().positive();

const crearQr = z.object({ pedido: codigo });

const simulacion = z.object({ estado: z.enum(['PAGADO', 'FALLIDO']).default('PAGADO') });

module.exports = { id, crearQr, simulacion };
