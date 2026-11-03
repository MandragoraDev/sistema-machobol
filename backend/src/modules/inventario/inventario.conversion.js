// 1 pulgada = 0.0254 m y 1 pie = 0.3048 m, así que 1 pulgada × 1 pie = 0.00774192 m² (= 774192 / 10^8).
const M2_POR_PULGADA_PIE_E8 = 774192n;

function aCentesimas(valor) {
  return BigInt(Math.round(valor * 100));
}

/**
 * Convierte una troca (piezas de `anchoPulg` pulgadas × `largoPies` pies) a m², redondeado a 4 decimales (half-up).
 * Ancho y largo admiten hasta 2 decimales. Se calcula con enteros (BigInt), así que el resultado es exacto.
 * Devuelve un string listo para una columna NUMERIC(12,4), p. ej. "6.1935".
 *
 * Copia idéntica en frontend/src/features/inventario/conversion.js: si cambias una, cambia la otra.
 */
function trocaAM2(piezas, anchoPulg, largoPies) {
  // m² × 10^4 = piezas × (ancho × 100) × (largo × 100) × 774192 / 10^8
  const producto = BigInt(piezas) * aCentesimas(anchoPulg) * aCentesimas(largoPies) * M2_POR_PULGADA_PIE_E8;
  const diezmilesimas = (producto + 50_000_000n) / 100_000_000n;
  return `${diezmilesimas / 10_000n}.${String(diezmilesimas % 10_000n).padStart(4, '0')}`;
}

module.exports = { trocaAM2 };
