const db = require('../../config/db');
const env = require('../../config/env');
const logger = require('../../config/logger');
const AppError = require('../../utils/AppError');
const { formatearDecimal, formatearFecha } = require('../../utils/formato');
const { aEntero } = require('../cotizador/cotizador.calculo');
const inventarioService = require('../inventario/inventario.service');
const pedidosRepository = require('../pedidos/pedidos.repository');
const { validoHasta } = require('../pedidos/pedidos.service');
const whatsappEnvio = require('../whatsapp/whatsapp.envio');
const pagosRepository = require('./pagos.repository');
const pasarela = require('./pasarela');

const ESTADOS_COBRABLES = ['COTIZADO', 'PENDIENTE_PAGO'];
// Un pago en estos estados ya movió (o puso en revisión) dinero y stock: un callback repetido no lo toca.
const ESTADOS_FINALES = ['CONFIRMADO', 'REVISION'];

/** El banco cobró, pero la madera no alcanza: se revierte todo y el pago pasa a revisión en otra transacción. */
class StockInsuficiente extends Error {
  constructor(pagoId) {
    super('Stock de madera insuficiente para confirmar el pedido.');
    this.pagoId = pagoId;
  }
}

/**
 * Genera el cobro QR por el TOTAL del pedido (no se aceptan anticipos).
 * Antes de cobrar comprueba que haya madera suficiente; el descuento real ocurre solo al confirmarse el pago.
 * Si el pedido ya tiene un QR vigente, devuelve ese mismo (no duplica cobros).
 */
async function crearCobroQr(codigo) {
  return db.withTransaction(async (client) => {
    const pedido = await pedidosRepository.bloquear(client, { codigo });
    if (!pedido) {
      throw new AppError(404, `El pedido ${codigo} no existe.`);
    }
    if (!ESTADOS_COBRABLES.includes(pedido.estado)) {
      throw new AppError(409, `El pedido ${codigo} está en estado «${pedido.estado_nombre}»: no admite pagos.`);
    }
    const vence = validoHasta(pedido.creado_en);
    if (vence < new Date()) {
      throw new AppError(409, `La cotización ${codigo} venció el ${formatearFecha(vence)}; hay que cotizar de nuevo.`);
    }

    const vigente = await pagosRepository.pendienteVigente(client, pedido.id);
    if (vigente) {
      return { pago: vigente, pedido, nuevo: false };
    }
    await pagosRepository.expirarVencidos(client, pedido.id);

    if (pedido.madera_id && aEntero(pedido.madera_requerida_m2, 4) > 0n) {
      const disponible = await inventarioService.stockDisponible(client, pedido.madera_id);
      if (aEntero(disponible, 4) < aEntero(pedido.madera_requerida_m2, 4)) {
        throw new AppError(
          409,
          `Stock de madera insuficiente para el pedido ${codigo}: se necesitan ${Number(pedido.madera_requerida_m2)} m² y hay ${Number(disponible)} m².`,
        );
      }
    }

    const expiraEn = new Date(Date.now() + env.pagos.qrVigenciaMinutos * 60_000);
    // Con un banco real esta llamada sale por red: el candado del pedido evita generar dos cobros a la vez.
    const cobro = await pasarela.crearCobro({ referencia: pedido.codigo, monto: pedido.total_final, expiraEn });
    const pago = await pagosRepository.insertar(client, {
      pedido_id: pedido.id,
      transaccion_id: cobro.transaccionId,
      monto: pedido.total_final,
      qr_payload: cobro.qrPayload,
      expira_en: expiraEn,
    });
    await pedidosRepository.cambiarEstado(client, pedido.id, 'PENDIENTE_PAGO');
    return { pago, pedido, nuevo: true };
  });
}

async function presentarCobro({ pago, pedido }, { conImagen = true } = {}) {
  return {
    id: pago.id,
    pedido: pedido.codigo,
    transaccion_id: pago.transaccion_id,
    monto: pago.monto,
    estado: pago.estado,
    expira_en: pago.expira_en,
    ...(conImagen && { qr_imagen: `data:image/png;base64,${(await pasarela.imagenQr(pago.qr_payload)).toString('base64')}` }),
  };
}

/**
 * Transacción ACID del pago (PLAN §2.3). Los candados se toman siempre en el mismo orden
 * (pago → pedido → madera) para que dos pagos simultáneos nunca se bloqueen entre sí.
 */
async function aplicarCallback(client, { transaccionId, estado, monto }) {
  const pago = await pagosRepository.bloquear(client, { transaccionId });
  if (!pago) {
    throw new AppError(404, `Transacción desconocida: ${transaccionId}.`);
  }
  if (ESTADOS_FINALES.includes(pago.estado)) {
    return { resultado: 'YA_PROCESADO', pago };
  }
  if (aEntero(monto, 2) !== aEntero(pago.monto, 2)) {
    throw new AppError(400, `El monto pagado (${monto} Bs) no coincide con el cobro (${pago.monto} Bs).`);
  }

  const pedido = await pedidosRepository.bloquear(client, { id: pago.pedido_id });
  if (estado === 'FALLIDO') {
    if (pago.estado !== 'PENDIENTE') return { resultado: 'YA_PROCESADO', pago, pedido };
    await pagosRepository.cambiarEstado(client, pago.id, 'FALLIDO');
    return { resultado: 'FALLIDO', pago, pedido };
  }

  if (!ESTADOS_COBRABLES.includes(pedido.estado)) {
    // Pedido cancelado o ya pagado con otro QR: el dinero entró y hay que revisarlo (p. ej. devolverlo).
    await pagosRepository.cambiarEstado(client, pago.id, 'REVISION');
    return { resultado: 'REVISION', pago, pedido };
  }

  if (pedido.madera_id && aEntero(pedido.madera_requerida_m2, 4) > 0n) {
    const salida = await inventarioService.registrarSalidaPorPedido(client, {
      maderaId: pedido.madera_id,
      cantidadM2: pedido.madera_requerida_m2,
      pedidoId: pedido.id,
      motivo: `Pedido ${pedido.codigo}: pago QR ${transaccionId} confirmado`,
    });
    if (!salida) throw new StockInsuficiente(pago.id);
  }
  await pagosRepository.cambiarEstado(client, pago.id, 'CONFIRMADO');
  const fase = await pedidosRepository.iniciarProduccion(client, pedido.id);
  await pedidosRepository.registrarHistorial(client, {
    pedidoId: pedido.id,
    faseId: fase.id,
    observacion: `Pago QR ${transaccionId} confirmado`,
  });
  return { resultado: 'CONFIRMADO', pago, pedido, fase };
}

/** El banco ya cobró y no hay madera: el pago queda en REVISION y el pedido en REVISION_STOCK. */
async function enviarARevisionDeStock(client, pagoId) {
  const pago = await pagosRepository.bloquear(client, { id: pagoId });
  if (ESTADOS_FINALES.includes(pago.estado)) {
    return { resultado: 'YA_PROCESADO', pago };
  }
  const pedido = await pedidosRepository.bloquear(client, { id: pago.pedido_id });
  await pagosRepository.cambiarEstado(client, pago.id, 'REVISION');
  await pedidosRepository.cambiarEstado(client, pedido.id, 'REVISION_STOCK');
  return { resultado: 'REVISION_STOCK', pago, pedido };
}

const AVISOS = {
  CONFIRMADO: ({ pedido, fase }) => `¡Pago recibido! Su pedido *${pedido.codigo}* ya está en producción (etapa 1 de 11: ${fase.nombre}). `
    + 'Le iremos informando el avance por este chat.',
  REVISION_STOCK: ({ pedido }) => `Recibimos su pago del pedido *${pedido.codigo}*. Un asesor le escribirá para confirmar la fecha de inicio de la fabricación.`,
  REVISION: ({ pedido }) => `Recibimos un pago para el pedido *${pedido.codigo}*. Un asesor lo revisará y le escribirá por este chat.`,
  FALLIDO: ({ pedido }) => `El pago del pedido *${pedido.codigo}* no se completó. Un asesor le escribirá para ayudarle.`,
};

/** Procesa un callback ya verificado. Es idempotente: un callback repetido no vuelve a descontar stock. */
async function procesarCallback(evento) {
  let efecto;
  try {
    efecto = await db.withTransaction((client) => aplicarCallback(client, evento));
  } catch (err) {
    if (!(err instanceof StockInsuficiente)) throw err;
    efecto = await db.withTransaction((client) => enviarARevisionDeStock(client, err.pagoId));
  }

  const { resultado, pago, pedido } = efecto;
  if (resultado === 'REVISION' || resultado === 'REVISION_STOCK') {
    // Alerta para el Admin; en el Sprint 5 también se mostrará en el Dashboard.
    logger.warn({ pedido: pedido.codigo, transaccion: pago.transaccion_id, resultado }, 'Pago en revisión: requiere acción del Admin');
  }
  if (AVISOS[resultado]) {
    whatsappEnvio.notificar(pedido.wa_id, pedido.cliente_id, AVISOS[resultado](efecto));
  }
  return { resultado, transaccion_id: pago.transaccion_id, pedido: pedido?.codigo ?? null };
}

/** QR del cobro vigente de un pedido (para enviarlo por WhatsApp). */
async function qrVigente(codigo) {
  return db.withTransaction(async (client) => {
    const pedido = await pedidosRepository.bloquear(client, { codigo });
    const pago = pedido && await pagosRepository.pendienteVigente(client, pedido.id);
    if (!pago) {
      throw new AppError(409, `El pedido ${codigo} no tiene un QR de pago vigente.`);
    }
    return {
      pago,
      buffer: await pasarela.imagenQr(pago.qr_payload),
      texto: `QR de pago del pedido ${codigo}: ${formatearDecimal(pago.monto)} Bs`,
    };
  });
}

/** Solo desarrollo: hace que la pasarela simulada "cobre" (o rechace) un QR y procesa su callback firmado. */
async function simularPago(id, estado = 'PAGADO') {
  const pago = await pagosRepository.buscarPorId(id);
  if (!pago) {
    throw new AppError(404, 'El pago no existe.');
  }
  const { cuerpo, firma } = pasarela.simularCallback({ transaccionId: pago.transaccion_id, monto: pago.monto, estado });
  return procesarCallback(pasarela.verificarCallback(cuerpo, firma));
}

module.exports = { crearCobroQr, presentarCobro, procesarCallback, qrVigente, simularPago };
