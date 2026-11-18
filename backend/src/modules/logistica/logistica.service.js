const db = require('../../config/db');
const AppError = require('../../utils/AppError');
const { formatearFecha, nombreMadera } = require('../../utils/formato');
const pedidosRepository = require('../pedidos/pedidos.repository');
const pedidosService = require('../pedidos/pedidos.service');
const whatsappEnvio = require('../whatsapp/whatsapp.envio');
const logisticaRepository = require('./logistica.repository');
const { ESTADOS_OPERATIVOS, siguientePaso, pasoAnterior, describirPaso } = require('./logistica.flujo');

const ZONA_HORARIA = 'America/La_Paz';

async function nombresDeFases() {
  return Object.fromEntries((await logisticaRepository.fases()).map((f) => [f.orden, f.nombre]));
}

function pasos(estado, fase, nombresFases) {
  if (!ESTADOS_OPERATIVOS.includes(estado)) return { siguiente: null, anterior: null };
  const siguiente = siguientePaso({ estado, fase });
  const anterior = pasoAnterior({ estado, fase });
  return {
    siguiente: siguiente && { ...siguiente, descripcion: describirPaso(siguiente, nombresFases) },
    anterior: anterior && { ...anterior, descripcion: describirPaso(anterior, nombresFases) },
  };
}

/** Tablero logístico: pedidos pagados con su etapa, el paso siguiente y el anterior. */
async function tablero() {
  const [fases, pedidos] = await Promise.all([logisticaRepository.fases(), logisticaRepository.tablero()]);
  const nombresFases = Object.fromEntries(fases.map((f) => [f.orden, f.nombre]));
  return {
    fases,
    pedidos: pedidos.map((p) => ({
      codigo: p.codigo,
      estado: p.estado,
      estado_nombre: p.estado_nombre,
      fase: p.fase ? { orden: p.fase, nombre: p.fase_nombre } : null,
      cliente: { nombre: p.cliente, wa_id: p.wa_id },
      porton: {
        tipo_porton: p.tipo_porton,
        madera: p.madera_especie ? nombreMadera({ especie: p.madera_especie, espesor_pulg: p.madera_espesor_pulg }) : null,
        ancho_m: p.ancho_m,
        alto_m: p.alto_m,
      },
      total_final: p.total_final,
      pagado_en: p.pagado_en,
      en_etapa_desde: p.en_etapa_desde,
      fecha_instalacion: p.fecha_instalacion,
      ...pasos(p.estado, p.fase, nombresFases),
    })),
  };
}

/** Pedido con su historial inmutable completo (trazabilidad). */
async function detalle(codigo) {
  const [pedido, historial, nombresFases] = await Promise.all([
    pedidosService.obtener(codigo),
    logisticaRepository.historial(codigo),
    nombresDeFases(),
  ]);
  return { ...pedido, ...pasos(pedido.estado, pedido.fase?.orden, nombresFases), historial };
}

function avisoAlCliente(destino, pedido) {
  if (destino.estado === 'EN_RUTA') {
    return `Su pedido *${pedido.codigo}* ya salió de nuestro taller y está en camino para la instalación.`;
  }
  if (destino.estado === 'ENTREGADO') {
    return `¡Listo! Su portón (pedido *${pedido.codigo}*) quedó instalado. Gracias por confiar en MACHOBOL.`;
  }
  return null;
}

/**
 * Mueve un pedido un paso adelante o atrás, en una transacción con el pedido bloqueado (FOR UPDATE).
 * `desde` es la etapa que el usuario veía: si otra persona lo movió antes, se rechaza (409) en vez de saltar dos pasos.
 * El cambio queda en el historial inmutable (trigger) con la hora exacta, el usuario y el motivo.
 */
async function mover(codigo, { accion, desde, motivo = null }, usuario) {
  const resultado = await db.withTransaction(async (client) => {
    const pedido = await pedidosRepository.bloquear(client, { codigo });
    if (!pedido) {
      throw new AppError(404, `El pedido ${codigo} no existe.`);
    }
    if (!ESTADOS_OPERATIVOS.includes(pedido.estado)) {
      throw new AppError(409, `El pedido ${codigo} está «${pedido.estado_nombre}»: todavía no entró a producción.`);
    }
    if (desde.estado !== pedido.estado || desde.fase !== pedido.fase_orden) {
      throw new AppError(409, `El pedido ${codigo} cambió mientras lo veías (ahora está en «${pedido.estado_nombre}», fase ${pedido.fase_orden}). Actualiza la página.`);
    }
    const destino = accion === 'avanzar' ? siguientePaso(desde) : pasoAnterior(desde);
    if (!destino) {
      throw new AppError(409, accion === 'avanzar'
        ? `El pedido ${codigo} ya está entregado e instalado.`
        : `El pedido ${codigo} está en la primera fase: no se puede retroceder.`);
    }
    await pedidosRepository.anotarCambio(client, { usuarioId: usuario.id, motivo });
    await pedidosRepository.moverA(client, pedido.id, destino);
    return { pedido, destino };
  });

  const aviso = accion === 'avanzar' && avisoAlCliente(resultado.destino, resultado.pedido);
  if (aviso) {
    whatsappEnvio.notificar(resultado.pedido.wa_id, resultado.pedido.cliente_id, aviso);
  }
  return detalle(codigo);
}

function hoyEnBolivia() {
  return new Date().toLocaleDateString('en-CA', { timeZone: ZONA_HORARIA }); // AAAA-MM-DD
}

/** Fecha en que se instalará el portón (calendario logístico). null la quita. */
async function programarInstalacion(codigo, fecha) {
  const pedido = await pedidosService.obtener(codigo);
  if (!['EN_PRODUCCION', 'EN_RUTA', 'REVISION_STOCK'].includes(pedido.estado)) {
    throw new AppError(409, `El pedido ${codigo} está «${pedido.estado_nombre}»: no se puede programar su instalación.`);
  }
  if (fecha && fecha < hoyEnBolivia()) {
    throw new AppError(400, `La fecha de instalación no puede ser anterior a hoy (${formatearFecha(new Date())}).`);
  }
  await pedidosRepository.programarInstalacion(codigo, fecha);
  return detalle(codigo);
}

module.exports = { tablero, detalle, mover, programarInstalacion };
