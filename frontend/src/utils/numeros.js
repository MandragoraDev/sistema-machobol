/**
 * Convierte el texto de un input numérico en número si está dentro de [min, max] y no excede
 * `decimales` cifras decimales (0 = entero). Si no es válido devuelve null.
 */
export function leerNumero(texto, { min, max, decimales = 0 }) {
  if (texto === '' || texto == null) return null;
  const valor = Number(texto);
  if (!Number.isFinite(valor) || valor < min || valor > max) return null;
  const escala = 10 ** decimales;
  if (Math.abs(valor * escala - Math.round(valor * escala)) > 1e-6) return null;
  return valor;
}
