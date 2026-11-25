const request = require('supertest');
const app = require('../src/app');
const pedidosService = require('../src/modules/pedidos/pedidos.service');
const pagosService = require('../src/modules/pagos/pagos.service');
const ventasService = require('../src/modules/ventas/ventas.service');
const graph = require('../src/modules/whatsapp/whatsapp.graph');
const { esperarPendientes } = require('../src/utils/segundoPlano');
const { db, describeConBD, reiniciarBD, crearUsuarioConToken, tokenAdmin, crearCliente, fijarStockCedro, idCedro } = require('./helpers/bd');

afterAll(() => db.pool.end());

const ENCARGADO = '59170000999';

describeConBD('Venta con reunión y anticipo (Sprint 6)', () => {
  let admin;
  let ventas;
  let taller;
  let cliente;
  let cedro;
  let usuarioAdmin;

  beforeAll(async () => {
    await reiniciarBD();
    admin = await tokenAdmin();
    ventas = (await crearUsuarioConToken('VENTAS')).token;
    taller = (await crearUsuarioConToken('TALLER')).token;
    cliente = await crearCliente();
    cedro = await idCedro();
    usuarioAdmin = (await db.query("SELECT id, nombre, rol FROM usuarios WHERE rol = 'ADMIN' LIMIT 1")).rows[0];
  });

  beforeEach(() => fijarStockCedro(100));

  const api = (token, metodo, ruta) => request(app)[metodo](`/api/ventas${ruta}`).set('Authorization', `Bearer ${token}`);
  const pagar = (codigo, monto) => pagosService.registrar({ pedido: codigo, monto, metodo: 'EFECTIVO' }, usuarioAdmin);
  const conEncargado = (numero) => db.query('UPDATE configuracion_negocio SET whatsapp_avisos = $1', [numero]);

  /** Portón corredizo de 4 × 2,20 en Cedro: 21.736 Bs (anticipo del 50 %: 10.868 Bs) y 9,68 m² de madera. */
  async function nuevoPedido() {
    return (await pedidosService.crearPedido(
      { tipo_porton: 'CORREDIZO', madera_id: cedro, ancho_m: 4, alto_m: 2.2, accesorios: [], fuera_ciudad: false },
      { clienteId: cliente.id, canal: 'WHATSAPP' },
    )).codigo;
  }

  async function avisosAlEncargado(accion) {
    await conEncargado(ENCARGADO);
    const espia = jest.spyOn(graph, 'enviar');
    try {
      await accion();
      await esperarPendientes();
      return espia.mock.calls.filter(([numero]) => numero === ENCARGADO).map(([, mensaje]) => mensaje.text.body);
    } finally {
      espia.mockRestore();
      await conEncargado(null);
    }
  }

  it('la bandeja de Ventas muestra primero las reuniones por agendar, con la preferencia del cliente', async () => {
    const cotizado = await nuevoPedido();
    const solicitado = await nuevoPedido();
    await ventasService.solicitarReunion(solicitado, { wa_id: cliente.wa_id, preferencia: 'Sábado en la mañana' });

    const res = await api(ventas, 'get', '/pedidos');
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({
      codigo: solicitado,
      estado: 'REUNION_SOLICITADA',
      reunion: { preferencia: 'Sábado en la mañana', fecha: null },
      total_referencial: '21736.00',
      pagado: '0.00',
    });
    expect(res.body.map((p) => p.codigo)).toContain(cotizado);
    expect((await api(ventas, 'get', '/pedidos?estado=COTIZADO')).body.every((p) => p.estado === 'COTIZADO')).toBe(true);
    expect((await api(taller, 'get', '/pedidos')).status).toBe(403);
  });

  it('pedir una reunión avisa al encargado por WhatsApp', async () => {
    const codigo = await nuevoPedido();
    const avisos = await avisosAlEncargado(() => ventasService.solicitarReunion(codigo, { wa_id: cliente.wa_id, preferencia: 'Jueves 18:00' }));
    expect(avisos).toEqual([
      `*📅 Nueva solicitud de reunión*\nPedido ${codigo} · Juan Pérez (+591 71234567) · total referencial 21.736,00 Bs.\nPrefiere: Jueves 18:00.`,
    ]);
  });

  it('agendar la reunión (Admin o Ventas) la deja en el historial y el cliente recibe la fecha por WhatsApp', async () => {
    const codigo = await nuevoPedido();
    const fecha = new Date(Date.now() + 2 * 86_400_000);
    fecha.setUTCHours(14, 0, 0, 0); // 10:00 en Bolivia

    const res = await api(ventas, 'patch', `/pedidos/${codigo}/reunion`).send({ fecha_reunion: fecha.toISOString() });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ estado: 'REUNION_AGENDADA', reunion: { fecha: fecha.toISOString() } });
    expect(res.body.historial.at(-1)).toMatchObject({
      estado_nuevo: 'REUNION_AGENDADA',
      usuario: 'Usuario VENTAS',
      motivo: expect.stringMatching(/^Reunión agendada para el \d{2}\/\d{2}\/\d{4} 10:00$/),
    });

    await esperarPendientes();
    const { rows: [ultimo] } = await db.query("SELECT contenido->'text'->>'body' AS texto FROM mensajes_whatsapp WHERE direccion = 'OUT' ORDER BY id DESC LIMIT 1");
    expect(ultimo.texto).toMatch(new RegExp(`^Su reunión con un asesor de MACHOBOL por el pedido \\*${codigo}\\* quedó agendada para el \\d{2}/\\d{2}/\\d{4} 10:00`));

    expect((await api(ventas, 'patch', `/pedidos/${codigo}/reunion`).send({ fecha_reunion: '2020-01-01T10:00:00-04:00' })).status).toBe(400);
    expect((await api(taller, 'patch', `/pedidos/${codigo}/reunion`).send({ fecha_reunion: fecha.toISOString() })).status).toBe(403);
  });

  it('el precio acordado (solo Admin, con motivo) queda en el historial con el anterior y no baja de lo pagado', async () => {
    const codigo = await nuevoPedido();
    expect((await api(ventas, 'patch', `/pedidos/${codigo}/precio`).send({ total_final: 20000, motivo: 'Descuento acordado' })).status).toBe(403);
    expect((await api(admin, 'patch', `/pedidos/${codigo}/precio`).send({ total_final: 20000 })).status).toBe(400);

    const res = await api(admin, 'patch', `/pedidos/${codigo}/precio`).send({ total_final: 20500.5, motivo: 'Descuento acordado en la visita' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      total_exacto: '21736.00',
      total_final: '20500.50',
      precio_acordado: true,
      cuenta: { saldo: '20500.50', anticipo_requerido: '10250.25' },
    });
    expect(res.body.historial.at(-1)).toMatchObject({
      estado_anterior: 'COTIZADO',
      estado_nuevo: 'COTIZADO',
      total_anterior: '21736.00',
      total_nuevo: '20500.50',
      usuario: 'Admin Pruebas',
      motivo: 'Descuento acordado en la visita',
    });

    await pagar(codigo, 15000);
    const bajo = await api(admin, 'patch', `/pedidos/${codigo}/precio`).send({ total_final: 14000, motivo: 'Error de tipeo' });
    expect(bajo.status).toBe(409);
    expect(bajo.body.error).toBe('El precio no puede quedar por debajo de lo ya pagado (15.000,00 Bs).');
  });

  it('la producción empieza solo con el anticipo cubierto (50 %) y descuenta la madera una sola vez', async () => {
    const codigo = await nuevoPedido();
    await pagar(codigo, 10000);
    let res = await api(admin, 'post', `/pedidos/${codigo}/iniciar-produccion`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Para iniciar la producción falta el anticipo: se pagaron 10.000,00 Bs de 10.868,00 Bs (50 % del precio acordado).');
    expect((await api(ventas, 'post', `/pedidos/${codigo}/iniciar-produccion`)).status).toBe(403);

    await pagar(codigo, 868);
    res = await api(admin, 'post', `/pedidos/${codigo}/iniciar-produccion`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ resultado: 'EN_PRODUCCION', pedido: { estado: 'EN_PRODUCCION', fase: { orden: 1 } } });
    expect((await api(admin, 'post', `/pedidos/${codigo}/iniciar-produccion`)).status).toBe(409);

    const { rows } = await db.query(
      'SELECT m.tipo, m.cantidad_m2 FROM movimientos_inventario m JOIN pedidos p ON p.id = m.pedido_id WHERE p.codigo = $1',
      [codigo],
    );
    expect(rows).toEqual([{ tipo: 'SALIDA', cantidad_m2: '-9.6800' }]);
    const { rows: [madera] } = await db.query('SELECT stock_actual_m2 FROM inventario_madera WHERE id = $1', [cedro]);
    expect(madera.stock_actual_m2).toBe('90.3200');
  });

  it('dos pedidos compiten por la última madera: uno entra a producción, el otro a revisión de stock, y se avisa al encargado', async () => {
    await fijarStockCedro(15); // alcanza para uno solo (9,68 m² cada uno)
    const pedidos = [await nuevoPedido(), await nuevoPedido()];
    for (const codigo of pedidos) await pagar(codigo, 10868);

    let resultados;
    const avisos = await avisosAlEncargado(async () => {
      resultados = await Promise.all(pedidos.map((codigo) => ventasService.iniciarProduccion(codigo, usuarioAdmin)));
    });
    expect(resultados.map((r) => r.resultado).sort()).toEqual(['EN_PRODUCCION', 'REVISION_STOCK']);
    const { rows: [madera] } = await db.query('SELECT stock_actual_m2 FROM inventario_madera WHERE id = $1', [cedro]);
    expect(madera.stock_actual_m2).toBe('5.3200');

    expect(avisos).toEqual(expect.arrayContaining([
      expect.stringMatching(/^\*⚠️ Madera insuficiente\*\nPedido MCH-\d{4}-\d{4}: se necesitan 9,68 m² de Cedro 1″ y hay 5,32 m²\./),
      expect.stringMatching(/^\*⚠️ Stock bajo\*\nCedro 1″ quedó con 5,32 m² \(mínimo 20,00 m²\) tras iniciar el pedido MCH-\d{4}-\d{4}\.$/),
    ]));
  });

  it('el Dashboard resume reuniones por agendar, pedidos sin madera y ventas del mes', async () => {
    const res = await api(ventas, 'get', '/resumen');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      reuniones_por_agendar: expect.any(Number),
      reuniones_proximas: expect.any(Number),
      sin_madera: 1,
      ventas_mes: { total: expect.any(String), pagos: expect.any(Number) },
    });
    expect(res.body.reuniones_por_agendar).toBeGreaterThanOrEqual(2);
  });
});
