const request = require('supertest');
const app = require('../src/app');
const pedidosService = require('../src/modules/pedidos/pedidos.service');
const { db, describeConBD, reiniciarBD, crearUsuarioConToken, tokenAdmin, crearCliente, idCedro } = require('./helpers/bd');

afterAll(() => db.pool.end());

describeConBD('Pagos registrados a mano por el Admin (Sprint 6)', () => {
  let admin;
  let ventas;
  let cliente;
  let cedro;

  beforeAll(async () => {
    await reiniciarBD();
    admin = await tokenAdmin();
    ventas = (await crearUsuarioConToken('VENTAS')).token;
    cliente = await crearCliente();
    cedro = await idCedro();
  });

  const conToken = (token, metodo, ruta) => request(app)[metodo](ruta).set('Authorization', `Bearer ${token}`);
  const pagar = (codigo, cuerpo, token = admin) => conToken(token, 'post', '/api/pagos').send({ pedido: codigo, metodo: 'EFECTIVO', ...cuerpo });
  const ficha = async (codigo) => (await conToken(admin, 'get', `/api/logistica/pedidos/${codigo}`)).body;

  /** Portón corredizo de 4 × 2,20 en Cedro con motor: 23.476 Bs (anticipo del 50 %: 11.738 Bs). */
  async function nuevoPedido() {
    return (await pedidosService.crearPedido(
      { tipo_porton: 'CORREDIZO', madera_id: cedro, ancho_m: 4, alto_m: 2.2, accesorios: ['MOTOR_CORREDIZO'], fuera_ciudad: false },
      { clienteId: cliente.id, canal: 'WHATSAPP' },
    )).codigo;
  }

  it('el Admin registra pagos y la cuenta muestra lo pagado, el saldo y si el anticipo está cubierto', async () => {
    const codigo = await nuevoPedido();
    let res = await pagar(codigo, { monto: 5000, metodo: 'QR', referencia: 'TRX-123' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      pedido: codigo,
      precio_acordado: '23476.00',
      pagado: '5000.00',
      saldo: '18476.00',
      anticipo_pct: 50,
      anticipo_requerido: '11738.00',
      anticipo_cubierto: false,
    });

    res = await pagar(codigo, { monto: 6738, metodo: 'CHEQUE', referencia: 'Cheque 00123' });
    expect(res.body).toMatchObject({ pagado: '11738.00', saldo: '11738.00', porcentaje_pagado: 50, anticipo_cubierto: true });

    const { cuenta } = await ficha(codigo);
    expect(cuenta.pagos.map((p) => [p.metodo, p.monto, p.referencia, p.registrado_por])).toEqual([
      ['QR', '5000.00', 'TRX-123', 'Admin Pruebas'],
      ['CHEQUE', '6738.00', 'Cheque 00123', 'Admin Pruebas'],
    ]);
  });

  it('un pago no puede superar el saldo, y solo el Admin registra pagos', async () => {
    const codigo = await nuevoPedido();
    const exceso = await pagar(codigo, { monto: 23476.01 });
    expect(exceso.status).toBe(409);
    expect(exceso.body.error).toMatch(/^El pago supera el saldo del pedido \(23\.476,00 Bs\)/);

    expect((await pagar(codigo, { monto: 100 }, ventas)).status).toBe(403);
    expect((await pagar(codigo, { monto: 0 })).status).toBe(400);
    expect((await pagar(codigo, { monto: 100, metodo: 'TARJETA' })).status).toBe(400);
    expect((await pagar('MCH-2026-9999', { monto: 100 })).status).toBe(404);
  });

  it('un pago se anula con motivo: sigue en la lista, deja de contar y no se anula dos veces', async () => {
    const codigo = await nuevoPedido();
    await pagar(codigo, { monto: 1000 });
    const { id } = (await ficha(codigo)).cuenta.pagos[0];

    expect((await conToken(admin, 'post', `/api/pagos/${id}/anular`).send({})).status).toBe(400);
    expect((await conToken(ventas, 'post', `/api/pagos/${id}/anular`).send({ motivo: 'No me corresponde' })).status).toBe(403);

    const res = await conToken(admin, 'post', `/api/pagos/${id}/anular`).send({ motivo: 'Cheque sin fondos' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ pedido: codigo, pagado: '0.00', saldo: '23476.00' });
    expect(res.body.pagos[0]).toMatchObject({ motivo_anulacion: 'Cheque sin fondos', anulado_por: 'Admin Pruebas', anulado_en: expect.any(String) });

    const otraVez = await conToken(admin, 'post', `/api/pagos/${id}/anular`).send({ motivo: 'Otra vez' });
    expect(otraVez.status).toBe(409);
  });

  it('un pago no se borra ni se edita, ni siquiera con acceso directo a la base', async () => {
    const codigo = await nuevoPedido();
    await pagar(codigo, { monto: 500 });
    const { rows: [{ id }] } = await db.query('SELECT pg.id FROM pagos pg JOIN pedidos p ON p.id = pg.pedido_id WHERE p.codigo = $1', [codigo]);
    await expect(db.query('DELETE FROM pagos WHERE id = $1', [id])).rejects.toThrow('Un pago no se borra: se anula con un motivo.');
    await expect(db.query('UPDATE pagos SET monto = 1 WHERE id = $1', [id])).rejects.toThrow('Un pago registrado no se modifica: solo se puede anular, una vez.');
  });

  it('las ventas del mes suman los pagos vigentes del mes', async () => {
    const res = await conToken(ventas, 'get', '/api/ventas/resumen');
    expect(res.status).toBe(200);
    const { rows: [esperado] } = await db.query(
      'SELECT COALESCE(sum(monto), 0)::numeric(12,2)::text AS total, count(*)::int AS pagos FROM pagos WHERE anulado_en IS NULL',
    );
    expect(res.body.ventas_mes).toEqual(esperado);
  });
});
