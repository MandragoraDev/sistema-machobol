const request = require('supertest');
const app = require('../src/app');
const { db, describeConBD, reiniciarBD, crearUsuarioConToken, tokenAdmin, crearCliente, idCedro, crearMaderaConPrecios } = require('./helpers/bd');

afterAll(() => db.pool.end());

const ANIO = new Date().toLocaleDateString('en-CA', { timeZone: 'America/La_Paz' }).slice(0, 4);

describeConBD('Cotizador, precios por madera y pedidos desde el panel', () => {
  let ventas;
  let taller;
  let admin;
  let cliente;
  let cedro;
  let SOLICITUD;

  beforeAll(async () => {
    await reiniciarBD();
    ventas = (await crearUsuarioConToken('VENTAS')).token;
    taller = (await crearUsuarioConToken('TALLER')).token;
    admin = await tokenAdmin();
    cliente = await crearCliente();
    cedro = await idCedro();
    SOLICITUD = { tipo_porton: 'CORREDIZO', madera_id: cedro, ancho_m: 4, alto_m: 2.2, accesorios: ['MOTOR_CORREDIZO'], fuera_ciudad: false };
  });

  const conToken = (token, metodo, ruta) => request(app)[metodo](ruta).set('Authorization', `Bearer ${token}`);
  const crearPedido = (cuerpo = {}) => conToken(ventas, 'post', '/api/pedidos').send({ ...SOLICITUD, cliente_id: cliente.id, ...cuerpo });

  describe('POST /api/cotizaciones/calcular', () => {
    it('devuelve el desglose exacto en Bs, sin redondeo y sin guardar nada; fuera de la ciudad no suma nada', async () => {
      const res = await conToken(ventas, 'post', '/api/cotizaciones/calcular').send({ ...SOLICITUD, fuera_ciudad: true });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        producto: { nombre: 'Portón Corredizo', tipo_porton: 'CORREDIZO' },
        madera: { id: cedro, nombre: 'Cedro 1″' },
        area_m2: '8.8000',
        precio_m2: '2470.00',
        subtotal_base: '21736.00',
        adicionales: [
          { codigo: 'MOTOR_CORREDIZO', tipo_adicional: 'ACCESORIO', precio: '1740.00' },
        ],
        fuera_ciudad: true,
        total_adicionales: '1740.00',
        total_exacto: '23476.00',
        total_final: '23476.00',
        madera_requerida_m2: '9.6800',
      });
      expect(res.body.ajuste_redondeo).toBeUndefined();
      const { rows: [{ total }] } = await db.query('SELECT count(*)::int AS total FROM pedidos');
      expect(total).toBe(0);
    });

    it('rechaza un motor incompatible, la falta de madera y el acceso del Taller', async () => {
      const incompatible = await conToken(ventas, 'post', '/api/cotizaciones/calcular').send({ ...SOLICITUD, accesorios: ['MOTOR_BATIENTE'] });
      expect(incompatible.status).toBe(400);
      expect(incompatible.body.error).toBe('Motor para portón batiente no es compatible con un portón corredizo.');
      const { madera_id, ...sinMadera } = SOLICITUD;
      expect((await conToken(ventas, 'post', '/api/cotizaciones/calcular').send(sinMadera)).status).toBe(400);
      expect((await conToken(taller, 'post', '/api/cotizaciones/calcular').send(SOLICITUD)).status).toBe(403);
    });
  });

  describe('Precio según la madera elegida', () => {
    let tajibo;
    let roble;

    beforeAll(async () => {
      tajibo = await crearMaderaConPrecios({ especie: 'Tajibo', espesor: 1.5, stock: 100, precios: { CORREDIZO: 2899.9, BATIENTE: 3000 } });
      roble = await crearMaderaConPrecios({ especie: 'roble', stock: 100, precios: { BATIENTE: 2750 } }); // sin precio para corredizo
    });

    it('cada madera cotiza con su propio precio por m²', async () => {
      const res = await conToken(ventas, 'post', '/api/cotizaciones/calcular').send({ ...SOLICITUD, madera_id: tajibo, accesorios: [] });
      expect(res.body).toMatchObject({ madera: { nombre: 'Tajibo 1,5″' }, precio_m2: '2899.90', total_final: '25519.12' });
    });

    it('una madera sin precio para ese tipo de portón, inactiva o inexistente no se puede cotizar', async () => {
      const sinPrecio = await conToken(ventas, 'post', '/api/cotizaciones/calcular').send({ ...SOLICITUD, madera_id: roble });
      expect(sinPrecio.status).toBe(400);
      expect(sinPrecio.body.error).toBe('Roble 1″ no está disponible para un portón corredizo.');
      expect((await conToken(ventas, 'post', '/api/cotizaciones/calcular').send({ ...SOLICITUD, madera_id: 99999 })).status).toBe(400);
    });

    it('GET /api/cotizaciones/maderas ofrece las maderas con precio y avisa si el stock alcanza', async () => {
      const res = await conToken(ventas, 'get', '/api/cotizaciones/maderas').query({ tipo_porton: 'corredizo', ancho_m: 4, alto_m: 2.2 });
      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        { id: cedro, nombre: 'Cedro 1″', especie: 'Cedro', espesor_pulg: '1.00', precio_m2: '2470.00', stock_suficiente: false },
        { id: tajibo, nombre: 'Tajibo 1,5″', especie: 'Tajibo', espesor_pulg: '1.50', precio_m2: '2899.90', stock_suficiente: true },
      ]);
      const batiente = await conToken(ventas, 'get', '/api/cotizaciones/maderas').query({ tipo_porton: 'BATIENTE' });
      expect(batiente.body.map((m) => m.nombre)).toEqual(['Cedro 1″', 'Roble 1″', 'Tajibo 1,5″']);
      expect(batiente.body[0].stock_suficiente).toBeUndefined();
    });

    it('PUT /api/catalogo/precios/:maderaId: el Admin fija o quita precios; los pedidos ya cotizados no cambian', async () => {
      const { body: { codigo } } = await crearPedido({ madera_id: tajibo, accesorios: [] });

      const res = await conToken(admin, 'put', `/api/catalogo/precios/${tajibo}`).send({ CORREDIZO: 3100.5, BATIENTE: null });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ CORREDIZO: '3100.50' });
      expect((await conToken(ventas, 'put', `/api/catalogo/precios/${tajibo}`).send({ CORREDIZO: 1 })).status).toBe(403);
      expect((await conToken(admin, 'put', `/api/catalogo/precios/${tajibo}`).send({ CORREDIZO: 0 })).status).toBe(400);

      const pedido = await conToken(ventas, 'get', `/api/pedidos/${codigo}`);
      expect(pedido.body).toMatchObject({ precio_m2: '2899.90', total_final: '25519.12', madera: { nombre: 'Tajibo 1,5″' } });

      const inventario = await conToken(taller, 'get', '/api/inventario');
      expect(inventario.body.maderas.find((m) => m.id === tajibo).precios).toEqual({ CORREDIZO: '3100.50' });
    });
  });

  describe('POST /api/pedidos', () => {
    beforeAll(() => db.query('TRUNCATE pedido_accesorios, pedidos RESTART IDENTITY CASCADE'));

    it('crea el pedido COTIZADO con código correlativo, precios congelados y la madera a descontar', async () => {
      const res = await crearPedido({ observaciones: 'Cliente pide color nogal' });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        codigo: `MCH-${ANIO}-0001`,
        estado: 'COTIZADO',
        canal: 'PANEL',
        cliente: { id: cliente.id, nombre: 'Juan Pérez' },
        precio_m2: '2470.00',
        total_exacto: '23476.00',
        total_final: '23476.00',
        madera: { id: cedro, nombre: 'Cedro 1″', requerida_m2: '9.6800' },
        observaciones: 'Cliente pide color nogal',
      });
      const { rows: [pedido] } = await db.query('SELECT creado_por, area_m2 FROM pedidos WHERE codigo = $1', [res.body.codigo]);
      expect(pedido.creado_por).not.toBeNull();
      expect(pedido.area_m2).toBe('8.8000'); // calculada por la propia BD
      expect((await crearPedido()).body.codigo).toBe(`MCH-${ANIO}-0002`);
    });

    it('pedidos creados a la vez reciben códigos distintos y correlativos', async () => {
      const respuestas = await Promise.all(Array.from({ length: 5 }, () => crearPedido()));
      const codigos = respuestas.map((r) => r.body.codigo).sort();
      expect(new Set(codigos).size).toBe(5);
      expect(codigos.at(-1)).toMatch(/-0007$/);
    });

    it('si el catálogo cambia después, el pedido conserva los precios con que se cotizó', async () => {
      const { body: { codigo } } = await crearPedido();
      await db.query('UPDATE precios_porton SET precio_m2 = 9999 WHERE madera_id = $1', [cedro]);
      await db.query("UPDATE accesorios SET precio = 5000 WHERE codigo = 'MOTOR_CORREDIZO'");
      try {
        const res = await conToken(ventas, 'get', `/api/pedidos/${codigo}`);
        expect(res.body).toMatchObject({ precio_m2: '2470.00', adicionales: [{ precio: '1740.00' }], total_final: '23476.00' });
      } finally {
        await db.query(
          `UPDATE precios_porton pp SET precio_m2 = CASE pr.tipo_porton WHEN 'CORREDIZO' THEN 2470 ELSE 2500 END
           FROM productos pr WHERE pr.id = pp.producto_id AND pp.madera_id = $1`,
          [cedro],
        );
        await db.query("UPDATE accesorios SET precio = 1740 WHERE codigo = 'MOTOR_CORREDIZO'");
      }
    });

    it('responde 404 si el cliente no existe y 403 al Taller', async () => {
      expect((await crearPedido({ cliente_id: 99999 })).status).toBe(404);
      expect((await conToken(taller, 'post', '/api/pedidos').send({ ...SOLICITUD, cliente_id: cliente.id })).status).toBe(403);
    });
  });

  describe('GET /api/pedidos/:codigo y proforma', () => {
    let codigo;
    beforeAll(async () => {
      codigo = (await crearPedido({ fuera_ciudad: true })).body.codigo;
    });

    it('el Taller puede consultar un pedido; los códigos inexistentes o mal escritos fallan', async () => {
      const res = await conToken(taller, 'get', `/api/pedidos/${codigo.toLowerCase()}`);
      expect(res.status).toBe(200);
      expect(res.body.adicionales.map((a) => a.codigo)).toEqual(['MOTOR_CORREDIZO']);
      expect(res.body).toMatchObject({ fuera_ciudad: true, total_final: '23476.00', precio_acordado: false, reunion: { preferencia: null, fecha: null } });
      expect((await conToken(taller, 'get', `/api/pedidos/MCH-${ANIO}-9999`)).status).toBe(404);
      expect((await conToken(taller, 'get', '/api/pedidos/PEDIDO-1')).status).toBe(400);
    });

    it('la proforma es un PDF de una página para Ventas y Admin, no para el Taller', async () => {
      const res = await conToken(ventas, 'get', `/api/pedidos/${codigo}/proforma`).buffer(true).parse((r, fin) => {
        const partes = [];
        r.on('data', (p) => partes.push(p));
        r.on('end', () => fin(null, Buffer.concat(partes)));
      });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toBe(`inline; filename="Proforma ${codigo}.pdf"`);
      expect(res.body.subarray(0, 5).toString()).toBe('%PDF-');
      expect(res.body.toString('latin1').match(/\/Type \/Page\b(?!s)/g)).toHaveLength(1);
      expect((await conToken(taller, 'get', `/api/pedidos/${codigo}/proforma`)).status).toBe(403);
    });
  });
});
