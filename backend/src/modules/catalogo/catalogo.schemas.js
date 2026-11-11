const { z, decimal } = require('../../utils/validar');

const id = z.coerce.number().int().positive();

// Precio por m² de una madera para cada tipo de portón; null quita el precio (la madera deja de ofrecerse).
const precio = decimal(2, { min: 0.01, max: 9_999_999_999.99, mensaje: 'Ingresa el precio por m² en Bs' }).nullable();

const preciosMadera = z
  .object({ CORREDIZO: precio, BATIENTE: precio })
  .partial()
  .refine((cambios) => Object.keys(cambios).length > 0, 'No hay precios que guardar');

module.exports = { id, preciosMadera };
