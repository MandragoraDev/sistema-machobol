const request = require('supertest');
const app = require('../src/app');
const env = require('../src/config/env');
const { db, describeConBD, reiniciarBD, tokenAdmin, crearCliente, fijarStockCedro, idCedro, crearMaderaConPrecios } = require('./helpers/bd');

afterAll(() => db.pool.end());

const SOLICITUD = {
  wa_id: '59171234567',
  tipo_porton: 'CORREDIZO',
  ancho_m: 4,
  alto_m: 2.2,
  accesorios: ['MOTOR_CORREDIZO'],
  fuera_ciudad: false,
};

describe('Autenticación servicio a servicio (X-Service-Token)', () => {
  it('rechaza con 401 las peticiones sin token o con un token incorrecto', async () => {
    expect((await request(app).get('/api/internal/catalogo')).status).toBe(401);
    const res = await request(app).get('/api/internal/catalogo').set('X-Service-Token', 'token-falso');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Token de servicio inválido.');
  });
});

describeConBD('API interna para Rasa', () => {
  const interna = (metodo, ruta) => request(app)[metodo](`/api/internal${ruta}`).set('X-Service-Token', env.serviceToken);

  beforeAll(async () => {
    await reiniciarBD();
    await crearCliente(SOLICITUD.wa_id);
    await crearCliente('59179999999', 'Otro cliente');
    SOLICITUD.madera_id = await idCedro();
  });

  it('un JWT de usuario, incluso de Admin, no sirve como token de servicio', async () => {
    const res = await request(app).get('/api/internal/catalogo').set('Authorization', `Bearer ${await tokenAdmin()}`);
    expect(res.status).toBe(401);
  });

  it('GET /catalogo devuelve los portones con su precio por m² en cada madera, y los accesorios', async () => {
    const res = await interna('get', '/catalogo');
    expect(res.status).toBe(200);
    const cedro = { madera_id: SOLICITUD.madera_id, madera: 'Cedro 1″' };
    expect(res.body.categorias).toEqual([
      {
        nombre: 'Portones',
        productos: [
          { nombre: 'Portón Corredizo', tipo_porton: 'CORREDIZO', modo_precio: 'POR_M2', precio_fijo: null, precios: [{ ...cedro, precio_m2: '2470.00' }] },
          { nombre: 'Portón Batiente', tipo_porton: 'BATIENTE', modo_precio: 'POR_M2', precio_fijo: null, precios: [{ ...cedro, precio_m2: '2500.00' }] },
        ],
      },
      { nombre: 'Parques infantiles', productos: [] },
    ]);
    expect(res.body.accesorios.map((a) => [a.codigo, a.precio])).toEqual([
      ['MOTOR_CORREDIZO', '1740.00'],
      ['MOTOR_BATIENTE', '2088.00'],
      ['PUERTA_INGRESO', '696.00'],
      ['TRANSPORTE_VIATICOS', '150.00'],
    ]);
  });

  it('POST /cotizaciones calcula el precio real y deja el pedido COTIZADO a nombre del cliente de WhatsApp', async () => {
    const res = await interna('post', '/cotizaciones').send({ ...SOLICITUD, accesorios: ['motor_corredizo', 'MOTOR_CORREDIZO'] });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      codigo: expect.stringMatching(/^MCH-\d{4}-0001$/),
      estado: 'COTIZADO',
      canal: 'WHATSAPP',
      cliente: { wa_id: SOLICITUD.wa_id },
      area_m2: '8.8000',
      subtotal_base: '21736.00',
      adicionales: [{ codigo: 'MOTOR_CORREDIZO', precio: '1740.00' }],
      total_exacto: '23476.00',
      total_final: '23476.00',
      madera: { nombre: 'Cedro 1″' },
    });
  });

  it('GET /maderas ofrece las maderas con precio para el tipo de portón y avisa si el stock alcanza', async () => {
    await fijarStockCedro(0);
    const tajibo = await crearMaderaConPrecios({ especie: 'tajibo', espesor: 30, stock: 659.4877, precios: { CORREDIZO: 2900 } });

    const res = await interna('get', '/maderas').query({ tipo_porton: 'CORREDIZO', ancho_m: 4, alto_m: 2.2 });
    expect(res.status).toBe(200);
    expect(res.body.map(({ id, nombre, precio_m2, stock_suficiente }) => ({ id, nombre, precio_m2, stock_suficiente }))).toEqual([
      { id: SOLICITUD.madera_id, nombre: 'Cedro 1″', precio_m2: '2470.00', stock_suficiente: false },
      { id: tajibo, nombre: 'Tajibo 30″', precio_m2: '2900.00', stock_suficiente: true },
    ]);
    expect((await interna('get', '/maderas').query({ tipo_porton: 'LEVADIZO' })).status).toBe(400);
  });

  it('POST /cotizaciones exige la madera', async () => {
    const { madera_id, ...sinMadera } = SOLICITUD;
    const res = await interna('post', '/cotizaciones').send(sinMadera);
    expect(res.status).toBe(400);
    expect(res.body.detalles).toEqual([{ campo: 'madera_id', mensaje: 'Elige la madera' }]);
  });

  it('POST /cotizaciones responde 404 si el wa_id no es de un cliente registrado', async () => {
    const res = await interna('post', '/cotizaciones').send({ ...SOLICITUD, wa_id: '59170000000' });
    expect(res.status).toBe(404);
  });

  it.each([
    ['un tipo de portón desconocido', { tipo_porton: 'LEVADIZO' }],
    ['más de 2 decimales en una medida', { alto_m: 2.205 }],
    ['una medida fuera del rango del cotizador', { ancho_m: 25 }],
    ['un wa_id que no es un número de WhatsApp', { wa_id: '+591 71234567' }],
    ['un accesorio que no existe', { accesorios: ['ALARMA'] }],
    ['el recargo de transporte pedido como accesorio', { accesorios: ['TRANSPORTE_VIATICOS'] }],
    ['un motor incompatible con el tipo de portón', { accesorios: ['MOTOR_BATIENTE'] }],
  ])('POST /cotizaciones rechaza con 400 %s', async (_caso, cambio) => {
    const res = await interna('post', '/cotizaciones').send({ ...SOLICITUD, ...cambio });
    expect(res.status).toBe(400);
  });

  it('POST /pedidos/:codigo/pago-qr genera el cobro sin imagen (la envía el backend como adjunto)', async () => {
    await fijarStockCedro(50);
    const { body: pedido } = await interna('post', '/cotizaciones').send(SOLICITUD);

    const res = await interna('post', `/pedidos/${pedido.codigo}/pago-qr`).send({ wa_id: SOLICITUD.wa_id });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ pedido: pedido.codigo, monto: '23476.00', estado: 'PENDIENTE' });
    expect(res.body.qr_imagen).toBeUndefined();
  });

  it('POST /pedidos/:codigo/pago-qr responde 404 si el pedido es de otro cliente', async () => {
    const { body: pedido } = await interna('post', '/cotizaciones').send(SOLICITUD);
    const res = await interna('post', `/pedidos/${pedido.codigo}/pago-qr`).send({ wa_id: '59179999999' });
    expect(res.status).toBe(404);
  });
});
