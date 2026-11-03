const request = require('supertest');
const app = require('../src/app');
const { db, describeConBD, reiniciarBD, crearUsuarioConToken, tokenAdmin } = require('./helpers/bd');

afterAll(() => db.pool.end());

describeConBD('Inventario de madera', () => {
  let admin;
  let taller;
  let ventas;
  let maderaId;

  const stockDe = async (id) => (await db.query('SELECT stock_actual_m2 FROM inventario_madera WHERE id = $1', [id])).rows[0].stock_actual_m2;
  const contarMovimientos = async () => Number((await db.query('SELECT count(*) FROM movimientos_inventario')).rows[0].count);

  beforeEach(async () => {
    await reiniciarBD();
    admin = await tokenAdmin();
    taller = (await crearUsuarioConToken('TALLER')).token;
    ventas = (await crearUsuarioConToken('VENTAS')).token;
    maderaId = (await db.query('SELECT id FROM inventario_madera LIMIT 1')).rows[0].id;
  });

  const post = (ruta, token, body) => request(app).post(ruta).set('Authorization', `Bearer ${token}`).send(body);

  describe('Ingreso de trocas', () => {
    it('10 piezas de 8″ × 10′ suman exactamente 6.1935 m² y generan un movimiento INGRESO', async () => {
      const res = await post('/api/inventario/ingresos', taller, {
        madera_id: maderaId, piezas: 10, ancho_pulg: 8, largo_pies: 10, observacion: 'Troca del proveedor A',
      });

      expect(res.status).toBe(201);
      expect(res.body.stock_actual_m2).toBe('6.1935');
      expect(res.body.movimiento).toMatchObject({
        tipo: 'INGRESO', cantidad_m2: '6.1935', stock_resultante_m2: '6.1935',
        piezas: 10, ancho_pulg: '8.00', largo_pies: '10.00', motivo: 'Troca del proveedor A',
      });
      expect(await stockDe(maderaId)).toBe('6.1935');
    });

    it('Ventas no puede registrar ingresos (403)', async () => {
      const res = await post('/api/inventario/ingresos', ventas, { madera_id: maderaId, piezas: 1, ancho_pulg: 8, largo_pies: 10 });
      expect(res.status).toBe(403);
      expect(await contarMovimientos()).toBe(0);
    });

    it('rechaza medidas con más de 2 decimales', async () => {
      const res = await post('/api/inventario/ingresos', admin, { madera_id: maderaId, piezas: 1, ancho_pulg: 8.125, largo_pies: 10 });
      expect(res.status).toBe(400);
      expect(res.body.detalles[0].campo).toBe('ancho_pulg');
    });

    it('no admite ingresos en una madera inactiva', async () => {
      await db.query('UPDATE inventario_madera SET activo = false WHERE id = $1', [maderaId]);
      const res = await post('/api/inventario/ingresos', admin, { madera_id: maderaId, piezas: 1, ancho_pulg: 8, largo_pies: 10 });
      expect(res.status).toBe(409);
    });
  });

  describe('Ajustes manuales', () => {
    beforeEach(async () => {
      await post('/api/inventario/ingresos', admin, { madera_id: maderaId, piezas: 10, ancho_pulg: 8, largo_pies: 10 });
    });

    it('el ajuste que dejaría el stock negativo se rechaza sin modificar nada', async () => {
      const movimientosAntes = await contarMovimientos();

      const res = await post('/api/inventario/ajustes', admin, { madera_id: maderaId, cantidad_m2: -7, motivo: 'Conteo físico' });

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/Stock insuficiente/);
      expect(await stockDe(maderaId)).toBe('6.1935');
      expect(await contarMovimientos()).toBe(movimientosAntes);
    });

    it('un ajuste válido actualiza el stock y registra el motivo', async () => {
      const res = await post('/api/inventario/ajustes', admin, { madera_id: maderaId, cantidad_m2: -1.5, motivo: 'Piezas dañadas por humedad' });

      expect(res.status).toBe(201);
      expect(res.body.stock_actual_m2).toBe('4.6935');
      expect(res.body.movimiento).toMatchObject({ tipo: 'AJUSTE', cantidad_m2: '-1.5000', motivo: 'Piezas dañadas por humedad' });
    });

    it('exige motivo y es exclusivo del Admin', async () => {
      const sinMotivo = await post('/api/inventario/ajustes', admin, { madera_id: maderaId, cantidad_m2: 1 });
      const delTaller = await post('/api/inventario/ajustes', taller, { madera_id: maderaId, cantidad_m2: 1, motivo: 'Conteo físico' });

      expect(sinMotivo.status).toBe(400);
      expect(delTaller.status).toBe(403);
    });
  });

  describe('Catálogo de maderas', () => {
    it('todos los roles ven el stock y el resumen', async () => {
      for (const token of [admin, taller, ventas]) {
        const res = await request(app).get('/api/inventario').set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.resumen).toMatchObject({ maderas: 1, bajo_minimo: 1 });
        expect(res.body.maderas[0]).toMatchObject({ especie: 'Cedro', bajo_minimo: true });
      }
    });

    it('el Admin crea maderas; una repetida responde 409 y el Taller no puede crearlas', async () => {
      const nueva = { especie: 'Mara', espesor_pulg: 1.5, stock_minimo_m2: 10 };
      expect((await post('/api/inventario', admin, nueva)).status).toBe(201);
      expect((await post('/api/inventario', admin, nueva)).status).toBe(409);
      expect((await post('/api/inventario', taller, { ...nueva, especie: 'Roble' })).status).toBe(403);
    });

    it('el stock no se puede editar directamente', async () => {
      const res = await request(app)
        .patch(`/api/inventario/${maderaId}`)
        .set('Authorization', `Bearer ${admin}`)
        .send({ stock_actual_m2: 999 });

      expect(res.status).toBe(400);
      expect(await stockDe(maderaId)).toBe('0.0000');
    });
  });

  it('lista los movimientos paginados y filtrados', async () => {
    for (let i = 0; i < 3; i += 1) {
      await post('/api/inventario/ingresos', taller, { madera_id: maderaId, piezas: 1, ancho_pulg: 8, largo_pies: 10 });
    }
    await post('/api/inventario/ajustes', admin, { madera_id: maderaId, cantidad_m2: 1, motivo: 'Conteo físico' });

    const res = await request(app)
      .get('/api/inventario/movimientos')
      .query({ tipo: 'INGRESO', limite: 2, pagina: 1 })
      .set('Authorization', `Bearer ${ventas}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 3, pagina: 1, limite: 2 });
    expect(res.body.datos).toHaveLength(2);
    expect(res.body.datos[0]).toMatchObject({ tipo: 'INGRESO', especie: 'Cedro', usuario: 'Usuario TALLER' });
  });
});
