/**
 * Arma la lista "col1 = $2, col2 = $3" de un UPDATE dinámico ($1 queda para el id).
 * Las claves de `cambios` deben venir de un esquema de validación: se interpolan como nombres de columna.
 */
function asignaciones(cambios) {
  return Object.keys(cambios)
    .map((columna, i) => `${columna} = $${i + 2}`)
    .join(', ');
}

module.exports = { asignaciones };
