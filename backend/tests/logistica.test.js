const request = require('supertest');
const app = require('../src/app');
const pedidosService = require('../src/modules/pedidos/pedidos.service');
const pagosService = require('../src/modules/pagos/pagos.service');
const { esperarPendientes } = require('../src/utils/segundoPlano');
const { db, describeConBD, reiniciarBD, crearUsuarioConToken, tokenAdmin, crearCliente, fijarStockCedro, idCedro } = require('./helpers/bd');

afterAll(() => db.pool.end());

describeConBD('Calendario logístico y trazabilidad (R-13)', () => {
  let admin;
  let taller;
  let ventas;
  let cliente;
  let cedro;

  beforeAll(async () => {
    await reiniciarBD();
    admin = await tokenAdmin();
    taller = (await crearUsuarioConToken('TALLER', { nombre: 'Rosa Taller' })).token;
    ventas = (await crearUsuarioConToken('VENTAS')).token;
    cliente = await crearCliente();
    cedro = await idCedro();
  });

  beforeEach(() => fijarStockCedro(100));

  const conToken = (token, metodo, ruta) => request(app)[metodo](`/api/logistica${ruta}`).set('Authorization', `Bearer ${token}`);
  const avanzar = (codigo, desde, token = taller, cuerpo = {}) => conToken(token, 'post', `/pedidos/${codigo}/avanzar`).send({ desde, ...cuerpo });

  async function nuevoPedido() {
    return (await pedidosService.crearPedido(
      { tipo_porton: 'CORREDIZO', madera_id: cedro, ancho_m: 4, alto_m: 2.2, accesorios: [], fuera_ciudad: false },
      { clienteId: cliente.id, canal: 'WHATSAPP' },
    )).codigo;
  }

  async function pedidoPagado() {
    const codigo = await nuevoPedido();
    const { pago } = await pagosService.crearCobroQr(codigo);
    await pagosService.simularPago(pago.id);
    await esperarPendientes();
    return codigo;
  }

  async function historial(codigo) {
    return (await conToken(admin, 'get', `/pedidos/${codigo}`)).body.historial;
  }

  it('el tablero muestra solo los pedidos pagados, con su etapa y el paso siguiente', async () => {
    const cotizado = await nuevoPedido();
    const pagado = await pedidoPagado();

    const res = await conToken(ventas, 'get', '/tablero');
    expect(res.status).toBe(200);
    expect(res.body.fases).toHaveLength(11);
    const codigos = res.body.pedidos.map((p) => p.codigo);
    expect(codigos).toContain(pagado);
    expect(codigos).not.toContain(cotizado);
    expect(res.body.pedidos.find((p) => p.codigo === pagado)).toMatchObject({
      estado: 'EN_PRODUCCION',
      fase: { orden: 1, nombre: 'Aserradero' },
      cliente: { nombre: 'Juan Pérez' },
      porton: { tipo_porton: 'CORREDIZO', madera: 'Cedro 1″', ancho_m: '4.00', alto_m: '2.20' },
      siguiente: { estado: 'EN_PRODUCCION', fase: 2, descripcion: 'Fase 2: Secado' },
      anterior: null,
      pagado_en: expect.any(String),
    });
  });

  it('cada cambio queda en el historial con la hora exacta, quién lo hizo y por qué', async () => {
    const codigo = await pedidoPagado();
    const antes = Date.now();
    const res = await avanzar(codigo, { estado: 'EN_PRODUCCION', fase: 1 }, taller, { observacion: 'Troncos seleccionados' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ estado: 'EN_PRODUCCION', fase: { orden: 2, nombre: 'Secado' } });

    const pasos = res.body.historial;
    expect(pasos.map((h) => [h.estado_nuevo, h.fase_nueva, h.usuario, h.motivo])).toEqual([
      ['COTIZADO', null, null, 'Cotización pedida por WhatsApp'],
      ['PENDIENTE_PAGO', null, null, expect.stringMatching(/^QR de pago MOCK-.+ generado$/)],
      ['EN_PRODUCCION', 1, null, expect.stringMatching(/^Pago QR MOCK-.+ confirmado$/)],
      ['EN_PRODUCCION', 2, 'Rosa Taller', 'Troncos seleccionados'],
    ]);
    const ultimo = pasos.at(-1);
    expect(ultimo).toMatchObject({ estado_anterior: 'EN_PRODUCCION', fase_anterior: 1, fase_anterior_nombre: 'Aserradero', usuario_rol: 'TALLER' });
    expect(new Date(ultimo.creado_en).getTime()).toBeGreaterThanOrEqual(antes - 1000);
    expect(new Date(ultimo.creado_en).getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('recorre las 11 fases: tras la 10 sale en ruta, luego queda entregado, y avisa al cliente por WhatsApp', async () => {
    const codigo = await pedidoPagado();
    let desde = { estado: 'EN_PRODUCCION', fase: 1 };
    let detalle;
    while (desde) {
      const res = await avanzar(codigo, desde);
      expect(res.status).toBe(200);
      detalle = res.body;
      desde = detalle.siguiente && { estado: detalle.estado, fase: detalle.fase.orden };
    }
    expect(detalle).toMatchObject({ estado: 'ENTREGADO', estado_nombre: 'Entregado / instalado', fase: { orden: 11 }, siguiente: null });
    expect(detalle.historial.map((h) => h.estado_nuevo).slice(-3)).toEqual(['EN_PRODUCCION', 'EN_RUTA', 'ENTREGADO']);

    const otraVez = await avanzar(codigo, { estado: 'ENTREGADO', fase: 11 });
    expect(otraVez.status).toBe(409);
    expect(otraVez.body.error).toBe(`El pedido ${codigo} ya está entregado e instalado.`);

    await esperarPendientes();
    const { rows } = await db.query("SELECT contenido->'text'->>'body' AS texto FROM mensajes_whatsapp WHERE direccion = 'OUT' ORDER BY id");
    const textos = rows.map((r) => r.texto);
    expect(textos).toContain(`Su pedido *${codigo}* ya salió de nuestro taller y está en camino para la instalación.`);
    expect(textos).toContain(`¡Listo! Su portón (pedido *${codigo}*) quedó instalado. Gracias por confiar en MACHOBOL.`);
  });

  it('no se puede saltar etapas: si el pedido cambió mientras se veía, el movimiento se rechaza', async () => {
    const codigo = await pedidoPagado();
    await avanzar(codigo, { estado: 'EN_PRODUCCION', fase: 1 });
    const desactualizado = await avanzar(codigo, { estado: 'EN_PRODUCCION', fase: 1 });
    expect(desactualizado.status).toBe(409);
    expect(desactualizado.body.error).toMatch(/cambió mientras lo veías/);
    expect((await conToken(admin, 'get', `/pedidos/${codigo}`)).body.fase.orden).toBe(2);
  });

  it('dos personas avanzan el mismo pedido a la vez: solo un avance pasa', async () => {
    const codigo = await pedidoPagado();
    const respuestas = await Promise.all([
      avanzar(codigo, { estado: 'EN_PRODUCCION', fase: 1 }, taller),
      avanzar(codigo, { estado: 'EN_PRODUCCION', fase: 1 }, admin),
    ]);
    expect(respuestas.map((r) => r.status).sort()).toEqual([200, 409]);
    const pasos = await historial(codigo);
    expect(pasos.filter((h) => h.fase_nueva === 2)).toHaveLength(1);
  });

  it('retroceder es solo del Admin y exige un motivo, que queda en el historial', async () => {
    const codigo = await pedidoPagado();
    expect((await conToken(admin, 'post', `/pedidos/${codigo}/retroceder`).send({ desde: { estado: 'EN_PRODUCCION', fase: 1 }, motivo: 'Prueba de retroceso' })).status).toBe(409);
    await avanzar(codigo, { estado: 'EN_PRODUCCION', fase: 1 });

    const desde = { estado: 'EN_PRODUCCION', fase: 2 };
    expect((await conToken(taller, 'post', `/pedidos/${codigo}/retroceder`).send({ desde, motivo: 'Falta secar más' })).status).toBe(403);
    const sinMotivo = await conToken(admin, 'post', `/pedidos/${codigo}/retroceder`).send({ desde });
    expect(sinMotivo.status).toBe(400);

    const res = await conToken(admin, 'post', `/pedidos/${codigo}/retroceder`).send({ desde, motivo: 'La madera necesita más secado' });
    expect(res.status).toBe(200);
    expect(res.body.fase.orden).toBe(1);
    expect(res.body.historial.at(-1)).toMatchObject({ fase_anterior: 2, fase_nueva: 1, usuario: 'Admin Pruebas', motivo: 'La madera necesita más secado' });
  });

  it('Ventas solo consulta, y un pedido sin pagar no entra a la logística', async () => {
    const pagado = await pedidoPagado();
    expect((await avanzar(pagado, { estado: 'EN_PRODUCCION', fase: 1 }, ventas)).status).toBe(403);
    expect((await conToken(ventas, 'get', `/pedidos/${pagado}`)).status).toBe(200);

    const cotizado = await nuevoPedido();
    const res = await avanzar(cotizado, { estado: 'EN_PRODUCCION', fase: 1 }, admin);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/todavía no entró a producción/);
  });

  it('programar la instalación (calendario): fechas futuras sí, pasadas no', async () => {
    const codigo = await pedidoPagado();
    const manana = new Date(Date.now() + 2 * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' });

    const res = await conToken(taller, 'patch', `/pedidos/${codigo}/instalacion`).send({ fecha_instalacion: manana });
    expect(res.status).toBe(200);
    expect(res.body.fecha_instalacion).toBe(manana);
    expect((await conToken(taller, 'patch', `/pedidos/${codigo}/instalacion`).send({ fecha_instalacion: '2020-01-01' })).status).toBe(400);
    expect((await conToken(ventas, 'patch', `/pedidos/${codigo}/instalacion`).send({ fecha_instalacion: manana })).status).toBe(403);

    const tablero = (await conToken(admin, 'get', '/tablero')).body.pedidos;
    expect(tablero[0].codigo).toBe(codigo); // los que tienen fecha van primero
    expect((await conToken(admin, 'patch', `/pedidos/${codigo}/instalacion`).send({ fecha_instalacion: null })).body.fecha_instalacion).toBeNull();
  });

  it('el historial es inmutable: ni siquiera con acceso directo a la base se puede modificar o borrar', async () => {
    const codigo = await pedidoPagado();
    const { rows: [{ id }] } = await db.query('SELECT h.id FROM historial_pedido h JOIN pedidos p ON p.id = h.pedido_id WHERE p.codigo = $1 LIMIT 1', [codigo]);
    await expect(db.query("UPDATE historial_pedido SET motivo = 'alterado' WHERE id = $1", [id])).rejects.toThrow('El historial de pedidos es inmutable: no se puede modificar un registro.');
    await expect(db.query('DELETE FROM historial_pedido WHERE id = $1', [id])).rejects.toThrow('El historial de pedidos es inmutable: no se puede borrar un registro.');
  });

  it('un pedido cobrado sin madera (revisión de stock) entra a producción cuando el Admin repone la madera', async () => {
    await fijarStockCedro(5); // el portón necesita 9,68 m²
    const codigo = await nuevoPedido();
    await fijarStockCedro(50);
    const { pago } = await pagosService.crearCobroQr(codigo);
    await fijarStockCedro(5);
    expect((await pagosService.simularPago(pago.id)).resultado).toBe('REVISION_STOCK');

    const tablero = (await conToken(admin, 'get', '/tablero')).body.pedidos;
    expect(tablero.find((p) => p.codigo === codigo)).toMatchObject({ estado: 'REVISION_STOCK', siguiente: null });

    const faltaMadera = await conToken(admin, 'post', `/pedidos/${codigo}/reintentar-produccion`);
    expect(faltaMadera.status).toBe(409);
    expect(faltaMadera.body.error).toBe('Aún falta madera: se necesitan 9.68 m² y hay 5 m².');
    expect((await conToken(taller, 'post', `/pedidos/${codigo}/reintentar-produccion`)).status).toBe(403);

    await fijarStockCedro(50);
    const res = await conToken(admin, 'post', `/pedidos/${codigo}/reintentar-produccion`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ estado: 'EN_PRODUCCION', fase: { orden: 1 } });
    expect(res.body.historial.at(-1)).toMatchObject({ estado_anterior: 'REVISION_STOCK', estado_nuevo: 'EN_PRODUCCION', usuario: 'Admin Pruebas', motivo: 'Madera repuesta: producción iniciada' });
    const { rows: [estado] } = await db.query(
      `SELECT q.estado, m.stock_actual_m2 FROM pagos_qr q JOIN pedidos p ON p.id = q.pedido_id JOIN inventario_madera m ON m.id = p.madera_id WHERE p.codigo = $1`,
      [codigo],
    );
    expect(estado).toEqual({ estado: 'CONFIRMADO', stock_actual_m2: '40.3200' });
  });
});
