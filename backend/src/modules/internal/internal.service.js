const AppError = require('../../utils/AppError');
const { nombreMadera } = require('../../utils/formato');
const catalogoRepository = require('../catalogo/catalogo.repository');
const clientesRepository = require('../clientes/clientes.repository');
const cotizadorService = require('../cotizador/cotizador.service');
const pedidosService = require('../pedidos/pedidos.service');
const pagosService = require('../pagos/pagos.service');

/**
 * Catálogo vigente para el bot: productos activos por categoría (los portones, con su precio por m² en cada madera)
 * y accesorios y recargos.
 */
async function catalogo() {
  const [categorias, productos, precios, accesorios] = await Promise.all([
    catalogoRepository.listarCategorias(),
    catalogoRepository.listarProductosActivos(),
    catalogoRepository.listarPreciosPorton(),
    catalogoRepository.listarAccesoriosActivos(),
  ]);
  return {
    categorias: categorias.map((c) => ({
      nombre: c.nombre,
      productos: productos.filter((p) => p.categoria_id === c.id).map(({ id, categoria_id, ...p }) => ({
        ...p,
        precios: precios
          .filter((precio) => precio.producto_id === id)
          .map((precio) => ({ madera_id: precio.madera_id, madera: nombreMadera(precio), precio_m2: precio.precio_m2 })),
      })),
    })),
    accesorios,
  };
}

/** Cotiza con el cotizador real y deja el pedido COTIZADO a nombre del cliente que escribe por WhatsApp. */
async function cotizar({ wa_id, ...solicitud }) {
  const cliente = await clientesRepository.buscarPorWaId(wa_id);
  if (!cliente) {
    throw new AppError(404, 'El cliente no está registrado.');
  }
  return pedidosService.crearPedido(solicitud, { clienteId: cliente.id, canal: 'WHATSAPP' });
}

/** Maderas que el bot puede ofrecer para ese tipo de portón (y si alcanza el stock, cuando ya conoce las medidas). */
function maderas(consulta) {
  return cotizadorService.maderasDisponibles(consulta);
}

/** Genera (o reutiliza) el QR de cobro de un pedido del cliente. La imagen la envía el backend como adjunto. */
async function crearPagoQr(codigo, { wa_id }) {
  await pedidosService.obtenerDelCliente(codigo, wa_id);
  return pagosService.presentarCobro(await pagosService.crearCobroQr(codigo), { conImagen: false });
}

module.exports = { catalogo, cotizar, maderas, crearPagoQr };
