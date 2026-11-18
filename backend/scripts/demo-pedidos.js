/**
 * Crea pedidos de demostración ya pagados, en distintas etapas, para probar el tablero logístico y las pruebas UAT.
 * Usa los mismos servicios que el sistema real: cotiza, cobra con la pasarela simulada (descuenta la madera)
 * y mueve cada pedido por sus fases, de modo que el historial queda completo.
 *
 *   npm run demo:pedidos
 *
 * Los clientes de demostración tienen números 591799900XX. Cada pedido consume madera de verdad.
 * No se pueden borrar después (el historial es inmutable): para empezar de cero, `npm run db:reset`.
 */
const { pool, query } = require('../src/config/db');
const cotizadorService = require('../src/modules/cotizador/cotizador.service');
const pedidosService = require('../src/modules/pedidos/pedidos.service');
const pagosService = require('../src/modules/pagos/pagos.service');
const logisticaService = require('../src/modules/logistica/logistica.service');
const { esperarPendientes } = require('../src/utils/segundoPlano');

// Cada pedido termina en una etapa distinta: { estado, fase } a la que se lo avanza, y en cuántos días se instala.
const PEDIDOS = [
  { cliente: 'Cliente demo · Ana Vargas', tipo: 'CORREDIZO', ancho: 4, alto: 2.2, accesorios: ['MOTOR_CORREDIZO'], hasta: { estado: 'EN_PRODUCCION', fase: 1 } },
  { cliente: 'Cliente demo · Luis Rojas', tipo: 'BATIENTE', ancho: 3, alto: 2, accesorios: ['PUERTA_INGRESO'], hasta: { estado: 'EN_PRODUCCION', fase: 4 }, instalaEnDias: 12 },
  { cliente: 'Cliente demo · Carla Méndez', tipo: 'CORREDIZO', ancho: 3.5, alto: 2.1, accesorios: [], hasta: { estado: 'EN_PRODUCCION', fase: 10 }, instalaEnDias: 3 },
  { cliente: 'Cliente demo · Jorge Suárez', tipo: 'BATIENTE', ancho: 2.8, alto: 2, accesorios: ['MOTOR_BATIENTE'], hasta: { estado: 'EN_RUTA', fase: 11 }, instalaEnDias: 1 },
];

function fechaEnDias(dias) {
  return new Date(Date.now() + dias * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });
}

async function admin() {
  const { rows: [usuario] } = await query("SELECT id, nombre, rol FROM usuarios WHERE rol = 'ADMIN' AND activo ORDER BY id LIMIT 1");
  if (!usuario) throw new Error('No hay un usuario Admin activo (npm run db:seed).');
  return usuario;
}

async function clienteDemo(indice, nombre) {
  const waId = `591799900${String(indice + 1).padStart(2, '0')}`;
  const { rows: [cliente] } = await query(
    `INSERT INTO clientes (wa_id, nombre) VALUES ($1, $2)
     ON CONFLICT (wa_id) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id`,
    [waId, nombre],
  );
  return cliente.id;
}

async function main() {
  const usuario = await admin();
  for (const [indice, p] of PEDIDOS.entries()) {
    const maderas = await cotizadorService.maderasDisponibles({ tipo_porton: p.tipo, ancho_m: p.ancho, alto_m: p.alto });
    const madera = maderas.find((m) => m.stock_suficiente);
    if (!madera) {
      console.log(`✗ ${p.cliente}: ninguna madera con precio para portón ${p.tipo.toLowerCase()} tiene stock suficiente. Se omite.`);
      continue;
    }
    const pedido = await pedidosService.crearPedido(
      { tipo_porton: p.tipo, madera_id: madera.id, ancho_m: p.ancho, alto_m: p.alto, accesorios: p.accesorios, fuera_ciudad: false },
      { clienteId: await clienteDemo(indice, p.cliente), canal: 'PANEL', usuarioId: usuario.id, observaciones: 'Pedido de demostración' },
    );
    const { pago } = await pagosService.crearCobroQr(pedido.codigo, { usuarioId: usuario.id });
    await pagosService.simularPago(pago.id);

    let desde = { estado: 'EN_PRODUCCION', fase: 1 };
    while (desde.estado !== p.hasta.estado || desde.fase !== p.hasta.fase) {
      const movido = await logisticaService.mover(pedido.codigo, { accion: 'avanzar', desde, motivo: 'Avance de demostración' }, usuario);
      desde = { estado: movido.estado, fase: movido.fase.orden };
    }
    if (p.instalaEnDias) {
      await logisticaService.programarInstalacion(pedido.codigo, fechaEnDias(p.instalaEnDias));
    }
    console.log(`✓ ${pedido.codigo} · ${p.cliente} · ${madera.nombre} · ${pedido.total_final} Bs → ${desde.estado}, fase ${desde.fase}`);
  }
  await esperarPendientes(); // avisos de WhatsApp en curso
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
