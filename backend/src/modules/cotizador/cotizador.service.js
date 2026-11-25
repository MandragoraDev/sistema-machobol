const AppError = require('../../utils/AppError');
const { nombreMadera } = require('../../utils/formato');
const cotizadorRepository = require('./cotizador.repository');
const { cotizarPorton, maderaRequerida, aEntero } = require('./cotizador.calculo');

async function productoActivo(tipoPorton) {
  const producto = await cotizadorRepository.productoPorTipo(tipoPorton);
  if (!producto) {
    throw new AppError(409, `No hay un portón ${tipoPorton.toLowerCase()} activo en el catálogo.`);
  }
  return producto;
}

/**
 * Cotiza un portón con el precio por m² de la madera elegida y los precios vigentes del catálogo. No guarda nada.
 * `fuera_ciudad` (instalación a 45 minutos o más) no suma nada: el costo del traslado se acuerda en la reunión.
 */
async function cotizar({ tipo_porton, madera_id, ancho_m, alto_m, accesorios = [], fuera_ciudad = false }) {
  const producto = await productoActivo(tipo_porton);
  const madera = await cotizadorRepository.maderaConPrecio(producto.id, madera_id);
  if (!madera) {
    throw new AppError(400, 'La madera elegida no existe.');
  }
  if (!madera.activo || !madera.precio_m2) {
    throw new AppError(400, `${nombreMadera(madera)} no está disponible para un portón ${tipo_porton.toLowerCase()}.`);
  }

  const codigos = [...new Set(accesorios)];
  const filas = await cotizadorRepository.accesoriosActivosPorCodigo(codigos);
  const porCodigo = new Map(filas.map((fila) => [fila.codigo, fila]));
  const desconocidos = codigos.filter((codigo) => !porCodigo.has(codigo));
  if (desconocidos.length > 0) {
    throw new AppError(400, `Accesorios desconocidos o inactivos: ${desconocidos.join(', ')}.`);
  }

  const calculo = cotizarPorton({
    producto,
    precioM2: madera.precio_m2,
    anchoM: ancho_m,
    altoM: alto_m,
    accesorios: codigos.map((codigo) => porCodigo.get(codigo)),
  });
  return {
    producto: { id: producto.id, nombre: producto.nombre, tipo_porton: producto.tipo_porton },
    madera: { id: madera.id, nombre: nombreMadera(madera) },
    fuera_ciudad,
    ...calculo,
  };
}

/**
 * Maderas que se pueden ofrecer para un tipo de portón (activas y con precio), con su precio por m².
 * Si se dan las medidas, indica además si el stock alcanza para fabricarlo.
 */
async function maderasDisponibles({ tipo_porton, ancho_m, alto_m }) {
  const producto = await productoActivo(tipo_porton);
  const maderas = await cotizadorRepository.maderasConPrecio(producto.id);
  const requerida = ancho_m && alto_m ? aEntero(maderaRequerida(producto, ancho_m, alto_m), 4) : null;
  return maderas.map((m) => ({
    id: m.id,
    nombre: nombreMadera(m),
    especie: m.especie,
    espesor_pulg: m.espesor_pulg,
    precio_m2: m.precio_m2,
    ...(requerida !== null && { stock_suficiente: aEntero(m.stock_actual_m2, 4) >= requerida }),
  }));
}

module.exports = { cotizar, maderasDisponibles };
