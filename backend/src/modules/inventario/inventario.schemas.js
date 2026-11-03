const { z, decimal } = require('../../utils/validar');

const id = z.coerce.number().int().positive();

// Límites alineados con las columnas NUMERIC del esquema.
const especie = z.string().trim().min(2, 'Ingresa la especie (mínimo 2 caracteres)').max(80);
const espesorPulg = decimal(2, { min: 0.01, max: 999.99, mensaje: 'Ingresa el espesor en pulgadas' });
const stockMinimoM2 = decimal(4, { min: 0, max: 99_999_999, mensaje: 'Ingresa el stock mínimo en m²' });

const crearMadera = z.object({
  especie,
  espesor_pulg: espesorPulg,
  stock_minimo_m2: stockMinimoM2.default(0),
});

// El stock no se edita aquí: solo cambia con ingresos, ajustes o salidas por pedido.
const actualizarMadera = z
  .object({ especie, espesor_pulg: espesorPulg, stock_minimo_m2: stockMinimoM2, activo: z.boolean() })
  .partial()
  .refine((cambios) => Object.keys(cambios).length > 0, 'No hay cambios que guardar');

const ingresoTroca = z.object({
  madera_id: id,
  piezas: z.number({ error: 'Ingresa la cantidad de piezas' }).int('Las piezas deben ser un número entero').min(1).max(10_000),
  ancho_pulg: decimal(2, { min: 0.01, max: 100, mensaje: 'Ingresa el ancho en pulgadas' }),
  largo_pies: decimal(2, { min: 0.01, max: 100, mensaje: 'Ingresa el largo en pies' }),
  observacion: z.string().trim().max(500).optional(),
});

const ajuste = z.object({
  madera_id: id,
  cantidad_m2: decimal(4, { min: -99_999_999, max: 99_999_999, mensaje: 'Ingresa la cantidad en m²' })
    .refine((valor) => valor !== 0, 'La cantidad no puede ser 0'),
  motivo: z.string().trim().min(5, 'Explica el motivo del ajuste (mínimo 5 caracteres)').max(500),
});

const filtrosMovimientos = z.object({
  madera_id: id.optional(),
  tipo: z.enum(['INGRESO', 'SALIDA', 'AJUSTE']).optional(),
  pagina: z.coerce.number().int().min(1).default(1),
  limite: z.coerce.number().int().min(1).max(100).default(20),
});

module.exports = { id, crearMadera, actualizarMadera, ingresoTroca, ajuste, filtrosMovimientos };
