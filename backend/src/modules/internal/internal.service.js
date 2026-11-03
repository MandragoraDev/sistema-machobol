const AppError = require('../../utils/AppError');
const catalogoRepository = require('../catalogo/catalogo.repository');

/** Catálogo vigente para el bot: productos activos agrupados por categoría, y accesorios y recargos. */
async function catalogo() {
  const [categorias, productos, accesorios] = await Promise.all([
    catalogoRepository.listarCategorias(),
    catalogoRepository.listarProductosActivos(),
    catalogoRepository.listarAccesoriosActivos(),
  ]);
  return {
    categorias: categorias.map((c) => ({
      nombre: c.nombre,
      productos: productos.filter((p) => p.categoria_id === c.id).map(({ categoria_id, ...p }) => p),
    })),
    accesorios,
  };
}

/** m² exactos (4 decimales) con aritmética entera: centímetros × centímetros. */
function areaM2(anchoM, altoM) {
  const cm2 = Math.round(anchoM * 100) * Math.round(altoM * 100);
  return `${Math.trunc(cm2 / 10000)}.${String(cm2 % 10000).padStart(4, '0')}`;
}

/**
 * Cotización SIMULADA (Sprint 3): valida la solicitud del bot y la devuelve resumida, sin precio.
 * El cálculo real (precios, recargo, redondeo a 100 Bs y PDF) llega en el Sprint 4.
 */
async function cotizarSimulado(datos) {
  const porCodigo = new Map((await catalogoRepository.listarAccesoriosActivos()).map((a) => [a.codigo, a]));
  const codigos = [...new Set(datos.accesorios)];
  const invalidos = codigos.filter((codigo) => porCodigo.get(codigo)?.tipo_adicional !== 'ACCESORIO');
  if (invalidos.length > 0) {
    throw new AppError(400, `Accesorios no válidos: ${invalidos.join(', ')}.`);
  }
  return {
    simulado: true,
    tipo_porton: datos.tipo_porton,
    ancho_m: datos.ancho_m,
    alto_m: datos.alto_m,
    area_m2: areaM2(datos.ancho_m, datos.alto_m),
    accesorios: codigos.map((codigo) => ({ codigo, nombre: porCodigo.get(codigo).nombre })),
    fuera_ciudad: datos.fuera_ciudad,
  };
}

module.exports = { catalogo, cotizarSimulado };
