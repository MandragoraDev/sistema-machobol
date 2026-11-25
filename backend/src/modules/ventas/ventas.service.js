// Venta de un portón (Sprint 6): cotización con precio referencial → reunión con un asesor → precio acordado y pagos →
// inicio de la producción con el anticipo cubierto (PLAN §2.3: el descuento de madera es una transacción ACID).
const db = require('../../config/db');
const AppError = require('../../utils/AppError');
const { formatearDecimal, formatearFechaHora, formatearM2, formatearTelefono, nombreMadera } = require('../../utils/formato');
const { aEntero } = require('../cotizador/cotizador.calculo');
const avisos = require('../avisos/avisos.service');
const configuracionService = require('../configuracion/configuracion.service');
const inventarioService = require('../inventario/inventario.service');
const pagosRepository = require('../pagos/pagos.repository');
const pagosService = require('../pagos/pagos.service');
const pedidosRepository = require('../pedidos/pedidos.repository');
const whatsappEnvio = require('../whatsapp/whatsapp.envio');
const ventasRepository = require('./ventas.repository');

// Antes de producción. REVISION_STOCK: el anticipo está cubierto, pero faltaba madera.
const PUEDE_INICIAR_PRODUCCION = ['COTIZADO', 'REUNION_SOLICITADA', 'REUNION_AGENDADA', 'REVISION_STOCK'];
const PUEDE_AGENDAR = ['COTIZADO', 'REUNION_SOLICITADA', 'REUNION_AGENDADA'];
const CERRADOS = ['CANCELADO', 'ENTREGADO'];

async function listar({ estado } = {}) {
  const filas = await ventasRepository.listar(estado ? { estados: [estado] } : {});
  return filas.map((p) => ({
    codigo: p.codigo,
    estado: p.estado,
    estado_nombre: p.estado_nombre,
    cliente: { nombre: p.cliente, wa_id: p.wa_id },
    canal: p.canal,
    porton: { tipo_porton: p.tipo_porton, ancho_m: p.ancho_m, alto_m: p.alto_m },
    total_referencial: p.total_exacto,
    precio_acordado: p.total_final,
    pagado: p.pagado,
    fuera_ciudad: p.fuera_ciudad,
    reunion: { preferencia: p.preferencia_reunion, fecha: p.fecha_reunion },
    creado_en: p.creado_en,
  }));
}

/** Datos para el Dashboard: reuniones, pedidos sin madera y ventas del mes (pagos vigentes del mes). */
async function resumen() {
  const [contadores, ventasMes] = await Promise.all([ventasRepository.contadores(), pagosRepository.ventasDelMes()]);
  return { ...contadores, ventas_mes: ventasMes };
}

async function bloquearPedido(client, codigo) {
  const pedido = await pedidosRepository.bloquear(client, { codigo });
  if (!pedido) {
    throw new AppError(404, `El pedido ${codigo} no existe.`);
  }
  return pedido;
}

/**
 * El cliente acepta la cotización y pide una reunión con un asesor (desde el bot). El encargado recibe un aviso.
 * Si ya la había pedido, solo se actualiza el horario que prefiere.
 */
async function solicitarReunion(codigo, { wa_id, preferencia = null }) {
  const efecto = await db.withTransaction(async (client) => {
    const pedido = await pedidosRepository.bloquear(client, { codigo });
    if (!pedido || pedido.wa_id !== wa_id) {
      throw new AppError(404, `El pedido ${codigo} no existe.`);
    }
    if (!['COTIZADO', 'REUNION_SOLICITADA'].includes(pedido.estado)) {
      throw new AppError(409, `El pedido ${codigo} está «${pedido.estado_nombre}»: la reunión ya no se solicita desde aquí.`);
    }
    await pedidosRepository.anotarCambio(client, {
      motivo: preferencia ? `Reunión solicitada por WhatsApp (prefiere: ${preferencia})` : 'Reunión solicitada por WhatsApp',
    });
    await pedidosRepository.solicitarReunion(client, pedido.id, preferencia);
    return { pedido, nueva: pedido.estado === 'COTIZADO' };
  });

  const { pedido, nueva } = efecto;
  if (nueva) {
    avisos.avisarEncargado(
      'REUNION_SOLICITADA',
      `Pedido ${pedido.codigo} · ${pedido.cliente_nombre ?? 'Cliente'} (${formatearTelefono(pedido.wa_id)}) · `
        + `total referencial ${formatearDecimal(pedido.total_final)} Bs.\nPrefiere: ${preferencia || 'sin indicar'}.`,
    );
  }
  return { codigo: pedido.codigo, estado: 'REUNION_SOLICITADA', nueva };
}

/** El asesor fija (o cambia) la fecha y hora de la reunión. El cliente recibe la confirmación por WhatsApp. */
async function agendarReunion(codigo, { fecha_reunion }, usuario) {
  const fecha = new Date(fecha_reunion);
  if (fecha.getTime() < Date.now() - 5 * 60_000) {
    throw new AppError(400, 'La reunión no puede quedar en el pasado.');
  }
  const pedido = await db.withTransaction(async (client) => {
    const bloqueado = await bloquearPedido(client, codigo);
    if (!PUEDE_AGENDAR.includes(bloqueado.estado)) {
      throw new AppError(409, `El pedido ${codigo} está «${bloqueado.estado_nombre}»: ya no necesita una reunión.`);
    }
    await pedidosRepository.anotarCambio(client, { usuarioId: usuario.id, motivo: `Reunión agendada para el ${formatearFechaHora(fecha)}` });
    await pedidosRepository.agendarReunion(client, bloqueado.id, fecha);
    return bloqueado;
  });
  whatsappEnvio.notificar(pedido.wa_id, pedido.cliente_id,
    `Su reunión con un asesor de MACHOBOL por el pedido *${pedido.codigo}* quedó agendada para el ${formatearFechaHora(fecha)}. `
    + 'Si necesita cambiarla, escríbanos por aquí.');
}

/** Precio final acordado con el cliente. Queda en el historial con el precio anterior, el usuario y el motivo. */
async function acordarPrecio(codigo, { total_final, motivo }, usuario) {
  await db.withTransaction(async (client) => {
    const pedido = await bloquearPedido(client, codigo);
    if (CERRADOS.includes(pedido.estado)) {
      throw new AppError(409, `El pedido ${codigo} está «${pedido.estado_nombre}»: su precio ya no se cambia.`);
    }
    const nuevo = aEntero(total_final, 2);
    if (nuevo === aEntero(pedido.total_final, 2)) {
      throw new AppError(400, 'Es el mismo precio que ya tiene el pedido.');
    }
    const pagado = await pagosRepository.totalVigente(client, pedido.id);
    if (nuevo < aEntero(pagado, 2)) {
      throw new AppError(409, `El precio no puede quedar por debajo de lo ya pagado (${formatearDecimal(pagado)} Bs).`);
    }
    await pedidosRepository.anotarCambio(client, { usuarioId: usuario.id, motivo });
    await pedidosRepository.acordarPrecio(client, pedido.id, total_final);
  });
}

function faltaMadera(pedido, madera, disponible) {
  return `se necesitan ${formatearM2(pedido.madera_requerida_m2)} m² de ${nombreMadera(madera)} y hay ${formatearM2(disponible)} m²`;
}

/**
 * Inicia la producción (Admin). Exige el anticipo cubierto y descuenta la madera en la misma transacción, con el
 * pedido y la madera bloqueados (FOR UPDATE): dos pedidos que compiten por la última madera nunca la descuentan dos veces.
 * Si la madera no alcanza, el pedido queda en REVISION_STOCK y se avisa al encargado; cuando se repone, se reintenta.
 */
async function iniciarProduccion(codigo, usuario) {
  const efecto = await db.withTransaction(async (client) => {
    const pedido = await bloquearPedido(client, codigo);
    if (!PUEDE_INICIAR_PRODUCCION.includes(pedido.estado)) {
      throw new AppError(409, `El pedido ${codigo} está «${pedido.estado_nombre}»: no se puede iniciar su producción.`);
    }
    const cuenta = await pagosService.cuentaDePedido(pedido, client);
    if (!cuenta.anticipo_cubierto) {
      throw new AppError(409, `Para iniciar la producción falta el anticipo: se pagaron ${formatearDecimal(cuenta.pagado)} Bs `
        + `de ${formatearDecimal(cuenta.anticipo_requerido)} Bs (${String(cuenta.anticipo_pct).replace('.', ',')} % del precio acordado).`);
    }

    const descuenta = pedido.madera_id && aEntero(pedido.madera_requerida_m2, 4) > 0n;
    if (descuenta) {
      const salida = await inventarioService.registrarSalidaPorPedido(client, {
        maderaId: pedido.madera_id,
        cantidadM2: pedido.madera_requerida_m2,
        pedidoId: pedido.id,
        motivo: `Pedido ${pedido.codigo}: producción iniciada`,
      });
      if (!salida) {
        const madera = await ventasRepository.madera(client, pedido.madera_id);
        const detalle = faltaMadera(pedido, madera, madera.stock_actual_m2);
        if (pedido.estado === 'REVISION_STOCK') {
          throw new AppError(409, `Aún falta madera: ${detalle}.`);
        }
        await pedidosRepository.anotarCambio(client, { usuarioId: usuario.id, motivo: `Anticipo cubierto, pero falta madera: ${detalle}` });
        await pedidosRepository.cambiarEstado(client, pedido.id, 'REVISION_STOCK');
        return { resultado: 'REVISION_STOCK', pedido, detalle };
      }
    }
    await pedidosRepository.anotarCambio(client, {
      usuarioId: usuario.id,
      motivo: pedido.estado === 'REVISION_STOCK' ? 'Madera repuesta: producción iniciada' : 'Anticipo cubierto: producción iniciada',
    });
    const fase = await pedidosRepository.iniciarProduccion(client, pedido.id);
    const madera = descuenta ? await ventasRepository.madera(client, pedido.madera_id) : null;
    return { resultado: 'EN_PRODUCCION', pedido, fase, madera };
  });

  const { resultado, pedido } = efecto;
  if (resultado === 'REVISION_STOCK') {
    avisos.avisarEncargado('MADERA_INSUFICIENTE',
      `Pedido ${pedido.codigo}: ${efecto.detalle}. El anticipo ya está cubierto: registra el ingreso de madera y pulsa «Reintentar producción» en su ficha.`);
    whatsappEnvio.notificar(pedido.wa_id, pedido.cliente_id,
      `Recibimos su anticipo del pedido *${pedido.codigo}*. Un asesor le escribirá para confirmar la fecha de inicio de la fabricación.`);
    return { resultado, mensaje: `Falta madera: ${efecto.detalle}. El pedido quedó en revisión de stock y se avisó al encargado.` };
  }

  const { madera, fase } = efecto;
  if (madera && aEntero(madera.stock_actual_m2, 4) <= aEntero(madera.stock_minimo_m2, 4)) {
    avisos.avisarEncargado('STOCK_BAJO',
      `${nombreMadera(madera)} quedó con ${formatearM2(madera.stock_actual_m2)} m² (mínimo ${formatearM2(madera.stock_minimo_m2)} m²) `
        + `tras iniciar el pedido ${pedido.codigo}.`);
  }
  const { tiempo_fabricacion: tiempo } = await configuracionService.obtener();
  whatsappEnvio.notificar(pedido.wa_id, pedido.cliente_id,
    `¡Recibimos su anticipo! Su pedido *${pedido.codigo}* ya está en producción (etapa 1 de 11: ${fase.nombre}). `
    + `Tiempo estimado de fabricación: ${tiempo.charAt(0).toLowerCase()}${tiempo.slice(1)}. Le iremos informando el avance por este chat.`);
  return { resultado, mensaje: 'Producción iniciada: el pedido entró a la fase 1.' };
}

module.exports = { listar, resumen, solicitarReunion, agendarReunion, acordarPrecio, iniciarProduccion };
