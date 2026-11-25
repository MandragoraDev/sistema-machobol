// Pagos registrados a mano por el Admin (Sprint 6). El precio final se acuerda en persona: el sistema lleva la cuenta
// de lo pagado, del saldo y del anticipo que se exige para iniciar la producción (configuracion_negocio.anticipo_pct).
const db = require('../../config/db');
const AppError = require('../../utils/AppError');
const { formatearDecimal } = require('../../utils/formato');
const { aEntero, aTexto } = require('../cotizador/cotizador.calculo');
const configuracionService = require('../configuracion/configuracion.service');
const pedidosRepository = require('../pedidos/pedidos.repository');
const pagosRepository = require('./pagos.repository');

// En estos estados el pedido ya no recibe pagos.
const ESTADOS_CERRADOS = ['CANCELADO', 'ENTREGADO'];

/** Monto del anticipo exigido: el porcentaje del precio acordado, redondeado hacia arriba al centavo. */
function anticipoRequerido(totalFinal, anticipoPct) {
  const total = aEntero(totalFinal, 2);
  const porcentaje = aEntero(anticipoPct, 2); // 50.00 → 5000n
  return aTexto((total * porcentaje + 9999n) / 10000n, 2);
}

/** Cuenta del pedido a partir de su precio acordado y de sus pagos (los anulados no cuentan). */
function cuenta(totalFinal, pagos, anticipoPct) {
  const pagado = pagos.filter((p) => !p.anulado_en).reduce((suma, p) => suma + aEntero(p.monto, 2), 0n);
  const total = aEntero(totalFinal, 2);
  const requerido = anticipoRequerido(totalFinal, anticipoPct);
  return {
    precio_acordado: totalFinal,
    pagado: aTexto(pagado, 2),
    saldo: aTexto(total - pagado, 2),
    porcentaje_pagado: total > 0n ? Number((pagado * 10000n) / total) / 100 : 0,
    anticipo_pct: Number(anticipoPct),
    anticipo_requerido: requerido,
    anticipo_cubierto: pagado >= aEntero(requerido, 2),
    pagos,
  };
}

async function cuentaDePedido(pedido, client) {
  const [pagos, configuracion] = await Promise.all([
    pagosRepository.listarDePedido(pedido.id, client),
    configuracionService.obtener(client),
  ]);
  return cuenta(pedido.total_final, pagos, configuracion.anticipo_pct);
}

/** Estado de cuenta de un pedido por su código (para la ficha del panel). */
async function cuentaPorCodigo(codigo) {
  const pedido = await pedidosRepository.obtenerPorCodigo(codigo);
  if (!pedido) {
    throw new AppError(404, `El pedido ${codigo} no existe.`);
  }
  return cuentaDePedido(pedido);
}

/** Registra un pago recibido. No puede superar el saldo: el exceso indica un error de tipeo o un precio sin actualizar. */
async function registrar({ pedido: codigo, monto, metodo, referencia, observacion }, usuario) {
  return db.withTransaction(async (client) => {
    const pedido = await pedidosRepository.bloquear(client, { codigo });
    if (!pedido) {
      throw new AppError(404, `El pedido ${codigo} no existe.`);
    }
    if (ESTADOS_CERRADOS.includes(pedido.estado)) {
      throw new AppError(409, `El pedido ${codigo} está «${pedido.estado_nombre}»: ya no recibe pagos.`);
    }
    const pagado = aEntero(await pagosRepository.totalVigente(client, pedido.id), 2);
    const saldo = aEntero(pedido.total_final, 2) - pagado;
    if (aEntero(monto, 2) > saldo) {
      throw new AppError(409, `El pago supera el saldo del pedido (${formatearDecimal(aTexto(saldo, 2))} Bs). `
        + 'Si se acordó otro precio, actualízalo primero.');
    }
    await pagosRepository.insertar(client, {
      pedido_id: pedido.id,
      monto: aTexto(aEntero(monto, 2), 2),
      metodo,
      referencia: referencia || null,
      observacion: observacion || null,
      registrado_por: usuario.id,
    });
    return cuentaDePedido(pedido, client);
  });
}

/** Anula un pago (no se borra: queda en la lista con su motivo). Un pedido ya entregado no se toca. */
async function anular(id, { motivo }, usuario) {
  return db.withTransaction(async (client) => {
    const pago = await pagosRepository.bloquear(client, id);
    if (!pago) {
      throw new AppError(404, 'El pago no existe.');
    }
    if (pago.anulado_en) {
      throw new AppError(409, 'Ese pago ya estaba anulado.');
    }
    const pedido = await pedidosRepository.bloquear(client, { id: pago.pedido_id });
    if (pedido.estado === 'ENTREGADO') {
      throw new AppError(409, `El pedido ${pedido.codigo} ya está entregado: sus pagos no se pueden anular.`);
    }
    await pagosRepository.anular(client, pago.id, { usuarioId: usuario.id, motivo });
    return { pedido: pedido.codigo, ...(await cuentaDePedido(pedido, client)) };
  });
}

module.exports = { anticipoRequerido, cuenta, cuentaDePedido, cuentaPorCodigo, registrar, anular };
