const request = require('supertest');
const app = require('../src/app');
const env = require('../src/config/env');
const { db, describeConBD, reiniciarBD, tokenAdmin } = require('./helpers/bd');

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

  beforeAll(reiniciarBD);

  it('un JWT de usuario, incluso de Admin, no sirve como token de servicio', async () => {
    const res = await request(app).get('/api/internal/catalogo').set('Authorization', `Bearer ${await tokenAdmin()}`);
    expect(res.status).toBe(401);
  });

  it('GET /catalogo devuelve los productos por categoría y los accesorios con sus precios en Bs', async () => {
    const res = await interna('get', '/catalogo');
    expect(res.status).toBe(200);
    expect(res.body.categorias).toEqual([
      {
        nombre: 'Portones',
        productos: [
          { nombre: 'Portón Corredizo', tipo_porton: 'CORREDIZO', modo_precio: 'POR_M2', precio_m2: '2470.00', precio_fijo: null },
          { nombre: 'Portón Batiente', tipo_porton: 'BATIENTE', modo_precio: 'POR_M2', precio_m2: '2500.00', precio_fijo: null },
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

  it('POST /cotizaciones (simulado) valida la solicitud y la devuelve con el área exacta, sin precio', async () => {
    const res = await interna('post', '/cotizaciones').send({ ...SOLICITUD, accesorios: ['motor_corredizo', 'MOTOR_CORREDIZO'] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      simulado: true,
      tipo_porton: 'CORREDIZO',
      ancho_m: 4,
      alto_m: 2.2,
      area_m2: '8.8000',
      accesorios: [{ codigo: 'MOTOR_CORREDIZO', nombre: 'Motor para portón corredizo' }],
      fuera_ciudad: false,
    });
  });

  it.each([
    ['un tipo de portón desconocido', { tipo_porton: 'LEVADIZO' }],
    ['más de 2 decimales en una medida', { alto_m: 2.205 }],
    ['un wa_id que no es un número de WhatsApp', { wa_id: '+591 71234567' }],
    ['un accesorio que no existe', { accesorios: ['ALARMA'] }],
    ['el recargo de transporte pedido como accesorio', { accesorios: ['TRANSPORTE_VIATICOS'] }],
  ])('POST /cotizaciones rechaza con 400 %s', async (_caso, cambio) => {
    const res = await interna('post', '/cotizaciones').send({ ...SOLICITUD, ...cambio });
    expect(res.status).toBe(400);
  });
});
