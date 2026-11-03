const { z } = require('zod');
const AppError = require('./AppError');

z.config(z.locales.es());

/** Valida `datos` con un esquema zod. Devuelve los datos ya normalizados o lanza un 400 con el detalle por campo. */
function validar(esquema, datos) {
  const resultado = esquema.safeParse(datos);
  if (!resultado.success) {
    const detalles = resultado.error.issues.map((issue) => ({
      campo: issue.path.join('.'),
      mensaje: issue.message,
    }));
    throw new AppError(400, 'Datos inválidos', detalles);
  }
  return resultado.data;
}

/** Número positivo con como máximo `decimales` cifras decimales (los NUMERIC de la BD no aceptan más). */
function decimal(decimales, { min = 0, max, mensaje } = {}) {
  const escala = 10 ** decimales;
  return z
    .number({ error: mensaje })
    .min(min)
    .max(max)
    .refine((valor) => Math.abs(valor * escala - Math.round(valor * escala)) < 1e-6, {
      error: `Admite como máximo ${decimales} decimales`,
    });
}

module.exports = { z, validar, decimal };
