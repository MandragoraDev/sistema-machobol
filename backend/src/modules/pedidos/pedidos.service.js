const db = require('../../config/db');
const env = require('../../config/env');
const AppError = require('../../utils/AppError');
const clientesRepository = require('../clientes/clientes.repository');
const cotizadorService = require('../cotizador/cotizador.service');
const { nombreMadera } = require('../../utils/formato');
const pedidosRepository = require('./pedidos.repository');
const { generarProforma } = require('./pedidos.proforma');

const DIA_MS = 86_400_000;

/** Hasta cuándo se respeta el precio cotizado. */
function validoHasta(creadoEn) {
  return new Date(creadoEn.getTime() + env.cotizacionValidezDias * DIA_MS);
}

function presentar(p) {
  return {
    codigo: p.codigo,
    estado: p.estado,
    estado_nombre: p.estado_nombre,
    fase: p.fase_orden ? { orden: p.fase_orden, nombre: p.fase_nombre } : null,
    cliente: { id: p.cliente_id, wa_id: p.wa_id, nombre: p.cliente_nombre, ci_nit: p.ci_nit },
    producto: { nombre: p.producto, tipo_porton: p.tipo_porton },
    ancho_m: p.ancho_m,
    alto_m: p.alto_m,
    area_m2: p.area_m2,
    precio_m2: p.precio_m2_aplicado,
    subtotal_base: p.subtotal_base,
    adicionales: p.adicionales,
    total_adicionales: p.total_adicionales,
    total_exacto: p.total_exacto,
    total_final: p.total_final,
    madera: p.madera_id
      ? {
        id: p.madera_id,
        nombre: nombreMadera({ especie: p.madera_especie, espesor_pulg: p.madera_espesor_pulg }),
        especie: p.madera_especie,
        espesor_pulg: p.madera_espesor_pulg,
        requerida_m2: p.madera_requerida_m2,
      }
      : null,
    canal: p.canal,
    observaciones: p.observaciones,
    fecha_instalacion: p.fecha_instalacion,
    creado_en: p.creado_en,
    valido_hasta: validoHasta(p.creado_en),
  };
}

async function obtener(codigo) {
  const pedido = await pedidosRepository.obtenerPorCodigo(codigo);
  if (!pedido) {
    throw new AppError(404, `El pedido ${codigo} no existe.`);
  }
  return presentar(pedido);
}

/** Pedido visto por el asistente: si no es del cliente que conversa, responde como si no existiera. */
async function obtenerDelCliente(codigo, waId) {
  const pedido = await pedidosRepository.obtenerPorCodigo(codigo);
  if (!pedido || pedido.wa_id !== waId) {
    throw new AppError(404, `El pedido ${codigo} no existe.`);
  }
  return presentar(pedido);
}

/**
 * Cotiza con los precios vigentes y guarda el pedido en estado COTIZADO, con el precio por m² de la madera elegida
 * y el de cada accesorio congelados, y la madera que se descontará cuando se confirme el pago.
 */
async function crearPedido(solicitud, { clienteId, canal, usuarioId = null, observaciones = null }) {
  const cliente = await clientesRepository.buscarPorId(clienteId);
  if (!cliente) {
    throw new AppError(404, 'El cliente no existe.');
  }
  const cotizacion = await cotizadorService.cotizar(solicitud);

  const codigo = await db.withTransaction(async (client) => {
    const nuevoCodigo = await pedidosRepository.siguienteCodigo(client);
    await pedidosRepository.anotarCambio(client, {
      usuarioId,
      motivo: canal === 'WHATSAPP' ? 'Cotización pedida por WhatsApp' : 'Cotización creada en el panel',
    });
    const id = await pedidosRepository.insertar(client, {
      codigo: nuevoCodigo,
      cliente_id: cliente.id,
      producto_id: cotizacion.producto.id,
      ancho_m: cotizacion.ancho_m,
      alto_m: cotizacion.alto_m,
      precio_m2_aplicado: cotizacion.precio_m2,
      subtotal_base: cotizacion.subtotal_base,
      total_adicionales: cotizacion.total_adicionales,
      total_exacto: cotizacion.total_exacto,
      total_final: cotizacion.total_final,
      madera_id: cotizacion.madera.id,
      madera_requerida_m2: cotizacion.madera_requerida_m2,
      canal,
      creado_por: usuarioId,
      observaciones,
    });
    await pedidosRepository.insertarAdicionales(client, id, cotizacion.adicionales);
    return nuevoCodigo;
  });
  return obtener(codigo);
}

async function proformaPdf(pedido) {
  return { buffer: await generarProforma(pedido), nombre: `Proforma ${pedido.codigo}.pdf` };
}

module.exports = { obtener, obtenerDelCliente, crearPedido, proformaPdf, validoHasta };
