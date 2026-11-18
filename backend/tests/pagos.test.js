const crypto = require('node:crypto');
const request = require('supertest');
const app = require('../src/app');
const env = require('../src/config/env');
const pasarela = require('../src/modules/pagos/pasarela');
const pedidosRepository = require('../src/modules/pedidos/pedidos.repository');
const pedidosService = require('../src/modules/pedidos/pedidos.service');
const { esperarPendientes } = require('../src/utils/segundoPlano');
const { db, describeConBD, reiniciarBD, crearUsuarioConToken, crearCliente, fijarStockCedro, idCedro } = require('./helpers/bd');

afterAll(() => db.pool.end());

// Portón corredizo de Cedro 4,00 × 2,20 m con motor: total exacto 23.476 Bs y 9,68 m² de madera (8,80 m² + 10 % de merma).
const SOLICITUD = { tipo_porton: 'CORREDIZO', ancho_m: 4, alto_m: 2.2, accesorios: ['MOTOR_CORREDIZO'], fuera_ciudad: false };

describeConBD('Pagos QR y transacción ACID (PLAN §2.3)', () => {
  let ventas;
  let cliente;
  let cedro;

  beforeAll(async () => {
    await reiniciarBD();
    ventas = (await crearUsuarioConToken('VENTAS')).token;
    cedro = await idCedro();
  });

  beforeEach(async () => {
    await db.query('TRUNCATE historial_pedido, movimientos_inventario, pagos_qr, pedido_accesorios, pedidos, mensajes_whatsapp, clientes RESTART IDENTITY CASCADE');
    cliente = await crearCliente();
    await fijarStockCedro(20);
  });

  const nuevoPedido = async (cambios = {}) => (await pedidosService.crearPedido(
    { ...SOLICITUD, madera_id: cedro, ...cambios },
    { clienteId: cliente.id, canal: 'WHATSAPP' },
  )).codigo;
  const generarQr = (codigo, token = ventas) => request(app).post('/api/pagos/qr').set('Authorization', `Bearer ${token}`).send({ pedido: codigo });

  /** Callback de la pasarela, firmado como lo firmaría el banco (o con otro secreto, para simular un ataque). */
  function callback(pago, { estado = 'PAGADO', monto = pago.monto, secreto = env.pagos.webhookSecret } = {}) {
    const cuerpo = JSON.stringify({ transaccion_id: pago.transaccion_id, estado, monto });
    const firma = crypto.createHmac('sha256', secreto).update(cuerpo).digest('hex');
    return request(app).post('/api/webhooks/pagos').set('Content-Type', 'application/json').set(pasarela.CABECERA_FIRMA, firma).send(cuerpo);
  }

  async function estado(codigo) {
    const { rows: [fila] } = await db.query(
      `SELECT e.codigo AS pedido, f.orden AS fase, m.stock_actual_m2 AS stock,
              (SELECT string_agg(estado::text, ',' ORDER BY id) FROM pagos_qr WHERE pedido_id = p.id) AS pagos,
              (SELECT count(*)::int FROM movimientos_inventario WHERE pedido_id = p.id AND tipo = 'SALIDA') AS salidas,
              (SELECT count(*)::int FROM historial_pedido h JOIN estados_pedido eh ON eh.id = h.estado_nuevo_id WHERE h.pedido_id = p.id AND eh.codigo = 'EN_PRODUCCION') AS historial
       FROM pedidos p
       JOIN estados_pedido e ON e.id = p.estado_id
       LEFT JOIN fases_produccion f ON f.id = p.fase_actual_id
       JOIN inventario_madera m ON m.id = p.madera_id
       WHERE p.codigo = $1`,
      [codigo],
    );
    return fila;
  }

  describe('POST /api/pagos/qr', () => {
    it('genera el cobro por el total exacto del pedido, con vencimiento, y sin tocar el stock', async () => {
      const codigo = await nuevoPedido();
      const res = await generarQr(codigo);
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ pedido: codigo, monto: '23476.00', estado: 'PENDIENTE', transaccion_id: expect.stringMatching(/^MOCK-/) });
      expect(res.body.qr_imagen).toMatch(/^data:image\/png;base64,iVBOR/);
      const minutos = (new Date(res.body.expira_en) - Date.now()) / 60_000;
      expect(minutos).toBeGreaterThan(env.pagos.qrVigenciaMinutos - 1);
      expect(await estado(codigo)).toMatchObject({ pedido: 'PENDIENTE_PAGO', stock: '20.0000', pagos: 'PENDIENTE', salidas: 0 });
    });

    it('si ya hay un QR vigente devuelve el mismo, sin duplicar el cobro', async () => {
      const codigo = await nuevoPedido();
      const primero = await generarQr(codigo);
      const segundo = await generarQr(codigo);
      expect(segundo.status).toBe(200);
      expect(segundo.body.transaccion_id).toBe(primero.body.transaccion_id);
    });

    it('pre-valida el stock: sin madera suficiente no se genera el cobro', async () => {
      await fijarStockCedro(9.6799);
      const codigo = await nuevoPedido();
      const res = await generarQr(codigo);
      expect(res.status).toBe(409);
      expect(res.body.error).toBe(`Stock de madera insuficiente para el pedido ${codigo}: se necesitan 9.68 m² y hay 9.6799 m².`);
      expect(await estado(codigo)).toMatchObject({ pedido: 'COTIZADO', pagos: null });
    });

    it('rechaza una cotización vencida y el acceso del Taller', async () => {
      const codigo = await nuevoPedido();
      await db.query("UPDATE pedidos SET creado_en = now() - interval '16 days' WHERE codigo = $1", [codigo]);
      const res = await generarQr(codigo);
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/venció/);
      const { token } = await crearUsuarioConToken('TALLER');
      expect((await generarQr(codigo, token)).status).toBe(403);
    });
  });

  describe('POST /api/webhooks/pagos', () => {
    it('pago confirmado: descuenta la madera, registra la SALIDA, confirma el pago y el pedido entra a la fase 1', async () => {
      const codigo = await nuevoPedido();
      const { body: pago } = await generarQr(codigo);

      const res = await callback(pago);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ resultado: 'CONFIRMADO', transaccion_id: pago.transaccion_id, pedido: codigo });
      expect(await estado(codigo)).toEqual({ pedido: 'EN_PRODUCCION', fase: 1, stock: '10.3200', pagos: 'CONFIRMADO', salidas: 1, historial: 1 });

      const { rows: [movimiento] } = await db.query("SELECT cantidad_m2, stock_resultante_m2, motivo FROM movimientos_inventario WHERE tipo = 'SALIDA'");
      expect(movimiento).toEqual({ cantidad_m2: '-9.6800', stock_resultante_m2: '10.3200', motivo: `Pedido ${codigo}: pago QR ${pago.transaccion_id} confirmado` });

      await esperarPendientes();
      const { rows: [aviso] } = await db.query("SELECT contenido FROM mensajes_whatsapp WHERE direccion = 'OUT'");
      expect(aviso.contenido.text.body).toBe(`¡Pago recibido! Su pedido *${codigo}* ya está en producción (etapa 1 de 11: Aserradero). Le iremos informando el avance por este chat.`);
    });

    it('cobra el monto exacto con centavos: el banco debe pagar exactamente eso, ni un centavo menos ni más', async () => {
      const codigo = await nuevoPedido({ ancho_m: 2.5, alto_m: 1.5, accesorios: [] }); // 3,75 m² × 2.470 = 9.262,50 Bs
      const { body: pago } = await generarQr(codigo);
      expect(pago.monto).toBe('9262.50');

      expect((await callback(pago, { monto: '9262.00' })).status).toBe(400);
      expect((await callback(pago, { monto: '9300.00' })).status).toBe(400);
      expect(await estado(codigo)).toMatchObject({ pedido: 'PENDIENTE_PAGO', pagos: 'PENDIENTE', stock: '20.0000' });

      expect((await callback(pago)).body.resultado).toBe('CONFIRMADO');
      expect(await estado(codigo)).toMatchObject({ pedido: 'EN_PRODUCCION', stock: '15.8750' }); // 3,75 × 1,10 = 4,125 m²
    });

    it('un callback repetido 3 veces (incluso a la vez) descuenta el stock una sola vez', async () => {
      const codigo = await nuevoPedido();
      const { body: pago } = await generarQr(codigo);

      const respuestas = await Promise.all([callback(pago), callback(pago), callback(pago)]);
      expect(respuestas.map((r) => r.status)).toEqual([200, 200, 200]);
      expect(respuestas.map((r) => r.body.resultado).sort()).toEqual(['CONFIRMADO', 'YA_PROCESADO', 'YA_PROCESADO']);
      expect(await estado(codigo)).toMatchObject({ stock: '10.3200', salidas: 1, historial: 1, pagos: 'CONFIRMADO' });
    });

    it('dos pagos simultáneos con madera para uno solo: uno entra a producción y el otro queda en REVISION_STOCK', async () => {
      await fijarStockCedro(15); // alcanza para un portón (9,68 m²), no para dos
      const [codigoA, codigoB] = [await nuevoPedido(), await nuevoPedido()];
      const [{ body: pagoA }, { body: pagoB }] = [await generarQr(codigoA), await generarQr(codigoB)];

      const respuestas = await Promise.all([callback(pagoA), callback(pagoB)]);
      expect(respuestas.map((r) => r.body.resultado).sort()).toEqual(['CONFIRMADO', 'REVISION_STOCK']);

      const estados = [await estado(codigoA), await estado(codigoB)];
      expect(estados.map((e) => e.pedido).sort()).toEqual(['EN_PRODUCCION', 'REVISION_STOCK']);
      expect(estados.map((e) => e.pagos).sort()).toEqual(['CONFIRMADO', 'REVISION']);
      expect(estados.map((e) => e.salidas).sort()).toEqual([0, 1]);
      expect(estados[0].stock).toBe('5.3200'); // nunca negativo

      await esperarPendientes();
      const { rows } = await db.query("SELECT contenido->'text'->>'body' AS texto FROM mensajes_whatsapp WHERE direccion = 'OUT' ORDER BY id");
      expect(rows.some((r) => r.texto.includes('Un asesor le escribirá para confirmar la fecha'))).toBe(true);
    });

    it('si falla cualquier paso dentro de la transacción no cambia ni el stock, ni el pago, ni el pedido', async () => {
      const codigo = await nuevoPedido();
      const { body: pago } = await generarQr(codigo);
      const espia = jest.spyOn(pedidosRepository, 'iniciarProduccion').mockRejectedValueOnce(new Error('Falla simulada al iniciar la producción'));

      const res = await callback(pago);
      expect(res.status).toBe(500);
      expect(await estado(codigo)).toEqual({ pedido: 'PENDIENTE_PAGO', fase: null, stock: '20.0000', pagos: 'PENDIENTE', salidas: 0, historial: 0 });

      // La pasarela reintenta y esta vez todo sale bien.
      espia.mockRestore();
      expect((await callback(pago)).body.resultado).toBe('CONFIRMADO');
      expect(await estado(codigo)).toMatchObject({ pedido: 'EN_PRODUCCION', stock: '10.3200' });
    });

    it('un pago fallido deja el pedido esperando un nuevo pago y no toca el stock', async () => {
      const codigo = await nuevoPedido();
      const { body: pago } = await generarQr(codigo);

      expect((await callback(pago, { estado: 'FALLIDO' })).body.resultado).toBe('FALLIDO');
      expect((await callback(pago, { estado: 'FALLIDO' })).body.resultado).toBe('YA_PROCESADO');
      expect(await estado(codigo)).toMatchObject({ pedido: 'PENDIENTE_PAGO', pagos: 'FALLIDO', stock: '20.0000' });

      const nuevo = await generarQr(codigo);
      expect(nuevo.status).toBe(201);
      expect(nuevo.body.transaccion_id).not.toBe(pago.transaccion_id);
    });

    it('si el pedido ya se pagó con otro QR, el segundo pago queda en REVISION sin descontar de nuevo', async () => {
      const codigo = await nuevoPedido();
      const { body: viejo } = await generarQr(codigo);
      await db.query("UPDATE pagos_qr SET expira_en = now() - interval '1 minute' WHERE id = $1", [viejo.id]);
      const { body: nuevo } = await generarQr(codigo);

      expect((await callback(nuevo)).body.resultado).toBe('CONFIRMADO');
      expect((await callback(viejo)).body.resultado).toBe('REVISION');
      expect(await estado(codigo)).toMatchObject({ pedido: 'EN_PRODUCCION', pagos: 'REVISION,CONFIRMADO', salidas: 1, stock: '10.3200' });
    });

    it('rechaza firma inválida (401), monto distinto (400) y transacción desconocida (404) sin cambiar nada', async () => {
      const codigo = await nuevoPedido();
      const { body: pago } = await generarQr(codigo);

      expect((await callback(pago, { secreto: 'secreto-de-un-atacante' })).status).toBe(401);
      expect((await callback(pago, { monto: '100.00' })).status).toBe(400);
      expect((await callback({ ...pago, transaccion_id: 'MOCK-NO-EXISTE' })).status).toBe(404);
      expect(await estado(codigo)).toMatchObject({ pedido: 'PENDIENTE_PAGO', pagos: 'PENDIENTE', stock: '20.0000' });
    });
  });

  describe('POST /api/dev/pagos/:id/simular', () => {
    it('con el token de servicio simula el cobro del QR y pasa por la misma transacción', async () => {
      const codigo = await nuevoPedido();
      const { body: pago } = await generarQr(codigo);

      expect((await request(app).post(`/api/dev/pagos/${pago.id}/simular`)).status).toBe(401);
      const res = await request(app).post(`/api/dev/pagos/${pago.id}/simular`).set('X-Service-Token', env.serviceToken);
      expect(res.body).toEqual({ resultado: 'CONFIRMADO', transaccion_id: pago.transaccion_id, pedido: codigo });
      expect(await estado(codigo)).toMatchObject({ pedido: 'EN_PRODUCCION', stock: '10.3200' });
    });

    it('también puede simular un pago rechazado', async () => {
      const codigo = await nuevoPedido();
      const { body: pago } = await generarQr(codigo);
      const res = await request(app).post(`/api/dev/pagos/${pago.id}/simular`).set('X-Service-Token', env.serviceToken).send({ estado: 'FALLIDO' });
      expect(res.body.resultado).toBe('FALLIDO');
    });
  });
});
