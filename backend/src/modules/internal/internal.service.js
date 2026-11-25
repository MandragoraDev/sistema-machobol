const AppError = require('../../utils/AppError');
const { nombreMadera } = require('../../utils/formato');
const catalogoRepository = require('../catalogo/catalogo.repository');
const clientesRepository = require('../clientes/clientes.repository');
const cotizadorService = require('../cotizador/cotizador.service');
const configuracionService = require('../configuracion/configuracion.service');
const pedidosRepository = require('../pedidos/pedidos.repository');
const pedidosService = require('../pedidos/pedidos.service');
const { aEntero, aTexto } = require('../cotizador/cotizador.calculo');
const ventasService = require('../ventas/ventas.service');

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

/** Datos del negocio que responde el bot (ubicación, horarios, formas de pago…). El número del encargado no sale. */
async function negocio() {
  const { whatsapp_avisos, actualizado_en, ...datos } = await configuracionService.obtener();
  return datos;
}

/** "¿Cómo va mi pedido?": estado, fase y saldo de los pedidos recientes del cliente (o de uno, por su código). */
async function estadoPedidos({ wa_id, codigo }) {
  const pedidos = await pedidosRepository.resumenDelCliente(wa_id, codigo ?? null);
  return {
    pedidos: pedidos.map((p) => ({
      codigo: p.codigo,
      estado: p.estado,
      estado_nombre: p.estado_nombre,
      fase: p.fase_orden ? { orden: p.fase_orden, nombre: p.fase_nombre } : null,
      fecha_reunion: p.fecha_reunion,
      fecha_instalacion: p.fecha_instalacion,
      precio: p.total_final,
      pagado: p.pagado,
      saldo: aTexto(aEntero(p.total_final, 2) - aEntero(p.pagado, 2), 2),
    })),
  };
}

/** El cliente acepta la cotización y pide una reunión con un asesor. */
function solicitarReunion(codigo, datos) {
  return ventasService.solicitarReunion(codigo, datos);
}

module.exports = { catalogo, cotizar, maderas, negocio, estadoPedidos, solicitarReunion };
