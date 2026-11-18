const { z } = require('../../utils/validar');
const { TOTAL_FASES, ESTADOS_OPERATIVOS } = require('./logistica.flujo');

// Etapa en la que el usuario veía el pedido: si cambió entretanto, el servidor rechaza el movimiento.
const desde = z.object({
  estado: z.enum(ESTADOS_OPERATIVOS),
  fase: z.number().int().min(1).max(TOTAL_FASES),
});

const avanzar = z.object({
  desde,
  observacion: z.string().trim().max(500).optional(),
});

const retroceder = z.object({
  desde,
  motivo: z.string({ error: 'Explica por qué retrocede el pedido' }).trim().min(5, 'Explica por qué retrocede el pedido (mínimo 5 caracteres)').max(500),
});

const instalacion = z.object({
  fecha_instalacion: z.iso.date({ error: 'Fecha inválida (AAAA-MM-DD)' }).nullable(),
});

module.exports = { avanzar, retroceder, instalacion };
