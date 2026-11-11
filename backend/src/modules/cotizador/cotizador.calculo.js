// Cotizador paramétrico de portones (PLAN §2.1). Función pura, en bolivianos y con aritmética entera:
// medidas en centímetros, montos en centavos y m² de madera en diezmilésimas, todo con BigInt.
const AppError = require('../../utils/AppError');

// Límites de medidas (los mismos que usa el asistente). Provisionales hasta que gerencia defina los comerciales.
const MEDIDA_MINIMA_CM = 30n;
const MEDIDA_MAXIMA_CM = 2000n;

/** Texto decimal ("2470.00", "1.000") o número → entero escalado (2470.00 con 2 decimales → 247000n), sin pasar por float. */
function aEntero(valor, decimales) {
  const texto = typeof valor === 'number' ? valor.toFixed(decimales) : String(valor).trim();
  if (!/^\d+(\.\d+)?$/.test(texto)) {
    throw new Error(`Valor decimal inválido: ${valor}`);
  }
  const [entero, fraccion = ''] = texto.split('.');
  return BigInt(entero + fraccion.padEnd(decimales, '0').slice(0, decimales));
}

/** Entero escalado → texto decimal (247000n con 2 decimales → "2470.00"). Admite negativos. */
function aTexto(valor, decimales) {
  const signo = valor < 0n ? '-' : '';
  const digitos = (valor < 0n ? -valor : valor).toString().padStart(decimales + 1, '0');
  return `${signo}${digitos.slice(0, -decimales)}.${digitos.slice(-decimales)}`;
}

/** División entera con redondeo al más cercano; el empate se redondea hacia arriba (valores no negativos). */
function dividirRedondeando(dividendo, divisor) {
  return (dividendo + divisor / 2n) / divisor;
}

function validarMedida(nombre, cm) {
  if (cm < MEDIDA_MINIMA_CM || cm > MEDIDA_MAXIMA_CM) {
    throw new AppError(400, `El ${nombre} debe estar entre ${aTexto(MEDIDA_MINIMA_CM, 2)} m y ${aTexto(MEDIDA_MAXIMA_CM, 2)} m.`);
  }
}

function validarAccesorio(accesorio, tipoPorton) {
  if (accesorio.tipo_adicional !== 'ACCESORIO') {
    throw new AppError(400, `${accesorio.nombre} no se elige como accesorio: se aplica según la entrega.`);
  }
  if (accesorio.tipo_porton_compatible && accesorio.tipo_porton_compatible !== tipoPorton) {
    throw new AppError(400, `${accesorio.nombre} no es compatible con un portón ${tipoPorton.toLowerCase()}.`);
  }
}

/** m² de madera en diezmilésimas: área (cm²) / 10⁴ × factor (milésimas) / 10³ × (10⁴ + merma en centésimas) / 10⁴ × 10⁴. */
function maderaEnDiezmilesimas(producto, areaCm2) {
  const factor = aEntero(producto.factor_consumo, 3);
  const merma = aEntero(producto.merma_pct, 2);
  return dividirRedondeando(areaCm2 * factor * (10_000n + merma), 10_000_000n);
}

/** Madera que consume un portón de estas medidas (área × factor_consumo × (1 + merma_pct / 100)), en m² con 4 decimales. */
function maderaRequerida(producto, anchoM, altoM) {
  return aTexto(maderaEnDiezmilesimas(producto, aEntero(anchoM, 2) * aEntero(altoM, 2)), 4);
}

/**
 * Cotiza un portón por m². Se cobra el monto EXACTO, sin redondeos (decisión del 2026-11-06):
 *
 *   área          = ancho × alto
 *   subtotal_base = área × precio_m2 de la madera elegida   (al centavo)
 *   total_final   = subtotal_base + accesorios + recargos    (= total_exacto)
 *   madera        = área × factor_consumo × (1 + merma_pct / 100)
 *
 * @param producto   fila de `productos` (tipo_porton, factor_consumo y merma_pct como texto NUMERIC)
 * @param precioM2   precio por m² de la madera elegida para ese tipo de portón (texto NUMERIC)
 * @param anchoM     ancho en metros, con 2 decimales como máximo
 * @param altoM      alto en metros, con 2 decimales como máximo
 * @param accesorios filas de `accesorios` elegidas por el cliente (tipo ACCESORIO)
 * @param recargos   filas de `accesorios` de tipo RECARGO que corresponden (p. ej. transporte)
 */
function cotizarPorton({ producto, precioM2, anchoM, altoM, accesorios = [], recargos = [] }) {
  if (producto.modo_precio !== 'POR_M2' || !producto.tipo_porton) {
    throw new AppError(400, `${producto.nombre} no se cotiza por m².`);
  }
  const anchoCm = aEntero(anchoM, 2);
  const altoCm = aEntero(altoM, 2);
  validarMedida('ancho', anchoCm);
  validarMedida('alto', altoCm);
  accesorios.forEach((accesorio) => validarAccesorio(accesorio, producto.tipo_porton));

  const areaCm2 = anchoCm * altoCm;
  const precio = aEntero(precioM2, 2);
  // Medio centavo no se puede cobrar: el subtotal se redondea al centavo más cercano.
  const subtotalBase = dividirRedondeando(areaCm2 * precio, 10_000n);

  const adicionales = [...accesorios, ...recargos].map((a) => ({ ...a, centavos: aEntero(a.precio, 2) }));
  const totalAdicionales = adicionales.reduce((suma, a) => suma + a.centavos, 0n);
  const total = subtotalBase + totalAdicionales;

  return {
    tipo_porton: producto.tipo_porton,
    ancho_m: aTexto(anchoCm, 2),
    alto_m: aTexto(altoCm, 2),
    area_m2: aTexto(areaCm2, 4),
    precio_m2: aTexto(precio, 2),
    subtotal_base: aTexto(subtotalBase, 2),
    adicionales: adicionales.map((a) => ({
      id: a.id,
      codigo: a.codigo,
      nombre: a.nombre,
      tipo_adicional: a.tipo_adicional,
      precio: aTexto(a.centavos, 2),
    })),
    total_adicionales: aTexto(totalAdicionales, 2),
    total_exacto: aTexto(total, 2),
    total_final: aTexto(total, 2),
    madera_requerida_m2: aTexto(maderaEnDiezmilesimas(producto, areaCm2), 4),
  };
}

module.exports = { cotizarPorton, maderaRequerida, aEntero, aTexto, MEDIDA_MINIMA_CM, MEDIDA_MAXIMA_CM };
