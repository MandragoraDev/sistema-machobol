/**
 * Crea pedidos de demostración en distintas etapas, para probar el panel (Ventas, Logística) y las pruebas UAT.
 * Usa los mismos servicios que el sistema real: cotiza, solicita y agenda reuniones, registra el anticipo,
 * inicia la producción (descuenta la madera) y mueve cada pedido por sus fases, así el historial queda completo.
 *
 *   npm run demo:pedidos
 *
 * Cada cliente de demostración tiene su número fijo (591799900XX). Los pedidos en producción consumen madera de verdad.
 * No se pueden borrar después (el historial es inmutable): para empezar de cero en Supabase,
 * docs/supabase/limpiar-datos-de-prueba.sql; en una base local, `npm run db:reset`.
 */
const { pool, query } = require('../src/config/db');
const { aEntero, aTexto } = require('../src/modules/cotizador/cotizador.calculo');
const cotizadorService = require('../src/modules/cotizador/cotizador.service');
const pedidosService = require('../src/modules/pedidos/pedidos.service');
const pagosService = require('../src/modules/pagos/pagos.service');
const ventasService = require('../src/modules/ventas/ventas.service');
const logisticaService = require('../src/modules/logistica/logistica.service');
const { esperarPendientes } = require('../src/utils/segundoPlano');

// Etapa final de cada pedido: `venta` (antes de producción) o `hasta` ({ estado, fase }) tras pagar el anticipo.
const PEDIDOS = [
  { wa: '59179990006', cliente: 'Cliente demo · María López', tipo: 'CORREDIZO', ancho: 4.5, alto: 2.2, accesorios: ['MOTOR_CORREDIZO'], venta: 'REUNION_SOLICITADA', preferencia: 'El sábado por la mañana' },
  { wa: '59179990007', cliente: 'Cliente demo · Rosa Gutiérrez', tipo: 'BATIENTE', ancho: 3.2, alto: 2, accesorios: [], venta: 'REUNION_AGENDADA', reunionEnDias: 2 },
  { wa: '59179990001', cliente: 'Cliente demo · Ana Vargas', tipo: 'CORREDIZO', ancho: 4, alto: 2.2, accesorios: ['MOTOR_CORREDIZO'], hasta: { estado: 'EN_PRODUCCION', fase: 1 } },
  { wa: '59179990002', cliente: 'Cliente demo · Luis Rojas', tipo: 'BATIENTE', ancho: 3, alto: 2, accesorios: ['PUERTA_INGRESO'], hasta: { estado: 'EN_PRODUCCION', fase: 4 }, instalaEnDias: 12 },
  { wa: '59179990003', cliente: 'Cliente demo · Carla Méndez', tipo: 'CORREDIZO', ancho: 3.5, alto: 2.1, accesorios: [], hasta: { estado: 'EN_PRODUCCION', fase: 10 }, instalaEnDias: 3 },
  { wa: '59179990004', cliente: 'Cliente demo · Jorge Suárez', tipo: 'BATIENTE', ancho: 2.8, alto: 2, accesorios: ['MOTOR_BATIENTE'], hasta: { estado: 'EN_RUTA', fase: 11 }, instalaEnDias: 1 },
];

function fechaEnDias(dias) {
  return new Date(Date.now() + dias * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
}

async function admin() {
  const { rows: [usuario] } = await query("SELECT id, nombre, rol FROM usuarios WHERE rol = 'ADMIN' AND activo ORDER BY id LIMIT 1");
  if (!usuario) throw new Error('No hay un usuario Admin activo (npm run db:seed).');
  return usuario;
}

async function clienteDemo(waId, nombre) {
  const { rows: [cliente] } = await query(
    `INSERT INTO clientes (wa_id, nombre) VALUES ($1, $2)
     ON CONFLICT (wa_id) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id, wa_id`,
    [waId, nombre],
  );
  return cliente;
}

/** La mitad del precio, redondeada hacia arriba al centavo (el anticipo del 50 %). */
function mitad(total) {
  return Number(aTexto((aEntero(total, 2) + 1n) / 2n, 2));
}

async function main() {
  const usuario = await admin();
  for (const p of PEDIDOS) {
    const maderas = await cotizadorService.maderasDisponibles({ tipo_porton: p.tipo, ancho_m: p.ancho, alto_m: p.alto });
    const madera = maderas.find((m) => m.stock_suficiente) ?? (p.venta ? maderas[0] : null);
    if (!madera) {
      console.log(`✗ ${p.cliente}: ninguna madera con precio para portón ${p.tipo.toLowerCase()} tiene stock suficiente. Se omite.`);
      continue;
    }
    const cliente = await clienteDemo(p.wa, p.cliente);
    const pedido = await pedidosService.crearPedido(
      { tipo_porton: p.tipo, madera_id: madera.id, ancho_m: p.ancho, alto_m: p.alto, accesorios: p.accesorios, fuera_ciudad: false },
      { clienteId: cliente.id, canal: 'PANEL', usuarioId: usuario.id, observaciones: 'Pedido de demostración' },
    );

    if (p.venta) {
      await ventasService.solicitarReunion(pedido.codigo, { wa_id: cliente.wa_id, preferencia: p.preferencia ?? null });
      if (p.venta === 'REUNION_AGENDADA') {
        const fecha = new Date(`${fechaEnDias(p.reunionEnDias)}T10:00:00-04:00`);
        await ventasService.agendarReunion(pedido.codigo, { fecha_reunion: fecha.toISOString() }, usuario);
      }
      console.log(`✓ ${pedido.codigo} · ${p.cliente} · ${madera.nombre} · ${pedido.total_final} Bs → ${p.venta}`);
      continue;
    }

    await pagosService.registrar({ pedido: pedido.codigo, monto: mitad(pedido.total_final), metodo: 'QR', referencia: 'Demo' }, usuario);
    await ventasService.iniciarProduccion(pedido.codigo, usuario);
    let desde = { estado: 'EN_PRODUCCION', fase: 1 };
    while (desde.estado !== p.hasta.estado || desde.fase !== p.hasta.fase) {
      const movido = await logisticaService.mover(pedido.codigo, { accion: 'avanzar', desde, motivo: 'Avance de demostración' }, usuario);
      desde = { estado: movido.estado, fase: movido.fase.orden };
    }
    if (p.instalaEnDias) {
      await logisticaService.programarInstalacion(pedido.codigo, fechaEnDias(p.instalaEnDias));
    }
    console.log(`✓ ${pedido.codigo} · ${p.cliente} · ${madera.nombre} · ${pedido.total_final} Bs (anticipo 50 %) → ${desde.estado}, fase ${desde.fase}`);
  }
  await esperarPendientes(); // avisos de WhatsApp en curso
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
