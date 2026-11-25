const request = require('supertest');
const app = require('../src/app');
const { db, describeConBD, reiniciarBD, crearUsuarioConToken, tokenAdmin } = require('./helpers/bd');

afterAll(() => db.pool.end());

describeConBD('Configuración del negocio (datos que responde el bot y WhatsApp del encargado)', () => {
  let admin;
  let ventas;
  let taller;

  beforeAll(async () => {
    await reiniciarBD();
    admin = await tokenAdmin();
    ventas = (await crearUsuarioConToken('VENTAS')).token;
    taller = (await crearUsuarioConToken('TALLER')).token;
  });

  const api = (token, metodo) => request(app)[metodo]('/api/configuracion').set('Authorization', `Bearer ${token}`);

  it('todos los roles la ven; viene cargada con los datos del negocio', async () => {
    const res = await api(taller, 'get');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ciudad: 'Santa Cruz de la Sierra',
      direccion: '4to anillo y calle Las Anguilas, a una cuadra de la radial 19',
      maps_url: 'https://maps.app.goo.gl/ygjFbw5tswdSbFnv9',
      horarios: 'De 7:30 a 21:00',
      anticipo_pct: '50.00',
      whatsapp_avisos: null,
    });
  });

  it('solo el Admin la cambia, con datos válidos; el número del encargado se normaliza', async () => {
    const { body: actual } = await api(admin, 'get');
    const { actualizado_en, ...datos } = actual;
    expect((await api(ventas, 'put').send(datos)).status).toBe(403);

    for (const invalido of [{ maps_url: 'http://maps.example.com' }, { whatsapp_avisos: 'abc' }, { anticipo_pct: 0 }, { horarios: '' }]) {
      const res = await api(admin, 'put').send({ ...datos, anticipo_pct: 50, ...invalido });
      expect(res.status).toBe(400);
    }

    const res = await api(admin, 'put').send({ ...datos, anticipo_pct: 40, whatsapp_avisos: '+591 712-34567' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ anticipo_pct: '40.00', whatsapp_avisos: '59171234567' });
    const { rows: [fila] } = await db.query('SELECT actualizado_por FROM configuracion_negocio');
    expect(fila.actualizado_por).not.toBeNull();
  });
});
