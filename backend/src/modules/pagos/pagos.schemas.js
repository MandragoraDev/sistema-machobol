const { z, decimal } = require('../../utils/validar');
const { codigo } = require('../pedidos/pedidos.schemas');

const id = z.coerce.number().int().positive();

// Pago que el Admin registra a mano tras recibir el dinero (QR del negocio, efectivo, transferencia o cheque).
const registrar = z.object({
  pedido: codigo,
  monto: decimal(2, { min: 0.01, max: 9_999_999_999.99, mensaje: 'Ingresa el monto en Bs' }),
  metodo: z.enum(['QR', 'EFECTIVO', 'TRANSFERENCIA', 'CHEQUE'], { error: 'Elige el método de pago' }),
  referencia: z.string().trim().max(80).optional(),
  observacion: z.string().trim().max(500).optional(),
});

const anular = z.object({
  motivo: z.string({ error: 'Explica por qué se anula el pago' }).trim().min(5, 'Explica por qué se anula el pago (mínimo 5 caracteres)').max(500),
});

module.exports = { id, registrar, anular };
