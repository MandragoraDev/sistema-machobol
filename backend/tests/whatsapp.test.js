jest.mock('../src/modules/whatsapp/whatsapp.rasa');

const request = require('supertest');
const app = require('../src/app');
const env = require('../src/config/env');
const rasa = require('../src/modules/whatsapp/whatsapp.rasa');
const { firmar } = require('../src/modules/whatsapp/whatsapp.firma');
const { esperarPendientes } = require('../src/utils/segundoPlano');
const { db, describeConBD, reiniciarBD } = require('./helpers/bd');

const WA_ID = '59171234567';
const URL = '/api/webhooks/whatsapp';

afterAll(() => db.pool.end());

function notificacion({ id = 'wamid.PRUEBA1', nombre = 'Juan Pérez', mensaje = { type: 'text', text: { body: 'hola' } } } = {}) {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'WABA',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '59100000000', phone_number_id: '123' },
          contacts: [{ profile: { name: nombre }, wa_id: WA_ID }],
          messages: [{ from: WA_ID, id, timestamp: '1793700000', ...mensaje }],
        },
      }],
    }],
  };
}

/** Envía el cuerpo tal cual (los bytes firmados son los mismos que recibe la API). */
function enviar(cuerpo, { secreto = env.whatsapp.appSecret, firma } = {}) {
  const json = JSON.stringify(cuerpo);
  return request(app)
    .post(URL)
    .set('Content-Type', 'application/json')
    .set('X-Hub-Signature-256', firma ?? firmar(json, secreto))
    .send(json);
}

async function mensajes(direccion) {
  const { rows } = await db.query(
    `SELECT m.wa_message_id, m.contenido FROM mensajes_whatsapp m
     JOIN clientes c ON c.id = m.cliente_id
     WHERE c.wa_id = $1 AND m.direccion = $2 ORDER BY m.id`,
    [WA_ID, direccion],
  );
  return rows;
}

describe('GET /api/webhooks/whatsapp (verificación de Meta)', () => {
  const verificar = (query) => request(app).get(URL).query(query);

  it('devuelve hub.challenge cuando el token coincide', async () => {
    const res = await verificar({ 'hub.mode': 'subscribe', 'hub.verify_token': env.whatsapp.verifyToken, 'hub.challenge': '1158201444' });
    expect(res.status).toBe(200);
    expect(res.text).toBe('1158201444');
  });

  it('responde 403 con un token incorrecto o sin hub.mode', async () => {
    expect((await verificar({ 'hub.mode': 'subscribe', 'hub.verify_token': 'otro', 'hub.challenge': '1' })).status).toBe(403);
    expect((await verificar({ 'hub.verify_token': env.whatsapp.verifyToken, 'hub.challenge': '1' })).status).toBe(403);
  });
});

describe('POST /api/webhooks/whatsapp: firma', () => {
  it('responde 401 si la firma no corresponde al App Secret', async () => {
    const res = await enviar(notificacion(), { secreto: 'secreto-de-un-atacante' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Firma inválida.');
  });

  it('responde 401 sin cabecera de firma o si el cuerpo fue alterado', async () => {
    const sinFirma = await request(app).post(URL).set('Content-Type', 'application/json').send(JSON.stringify(notificacion()));
    expect(sinFirma.status).toBe(401);

    const firmaDeOtroCuerpo = firmar(JSON.stringify(notificacion({ id: 'wamid.OTRO' })), env.whatsapp.appSecret);
    expect((await enviar(notificacion(), { firma: firmaDeOtroCuerpo })).status).toBe(401);
  });
});

describeConBD('POST /api/webhooks/whatsapp: procesamiento', () => {
  beforeEach(async () => {
    await reiniciarBD();
    rasa.conversar.mockReset();
  });

  it('registra al cliente y el mensaje, responde 200 y contesta con lo que dice Rasa', async () => {
    rasa.conversar.mockResolvedValue([
      { recipient_id: WA_ID, text: '¡Hola! ¿En qué le ayudo?', buttons: [{ title: 'Cotizar portón', payload: '/cotizar_porton' }] },
    ]);

    const res = await enviar(notificacion());
    expect(res.status).toBe(200);
    await esperarPendientes();

    const { rows: [cliente] } = await db.query('SELECT nombre FROM clientes WHERE wa_id = $1', [WA_ID]);
    expect(cliente.nombre).toBe('Juan Pérez');
    expect(rasa.conversar).toHaveBeenCalledWith(WA_ID, 'hola');

    const [entrante] = await mensajes('IN');
    expect(entrante.wa_message_id).toBe('wamid.PRUEBA1');
    const salientes = await mensajes('OUT');
    expect(salientes).toHaveLength(1);
    expect(salientes[0].wa_message_id).toMatch(/^sim\./); // modo simulado: nada sale hacia Meta
    expect(salientes[0].contenido.interactive.action.buttons[0].reply).toEqual({ id: '/cotizar_porton', title: 'Cotizar portón' });
  });

  it('un webhook repetido con el mismo wa_message_id se procesa una sola vez', async () => {
    rasa.conversar.mockResolvedValue([{ text: 'Respuesta' }]);

    const cuerpo = notificacion({ id: 'wamid.REPETIDO' });
    const respuestas = await Promise.all([enviar(cuerpo), enviar(cuerpo), enviar(cuerpo)]);
    expect(respuestas.map((r) => r.status)).toEqual([200, 200, 200]);
    await esperarPendientes();

    expect(rasa.conversar).toHaveBeenCalledTimes(1);
    expect(await mensajes('IN')).toHaveLength(1);
    expect(await mensajes('OUT')).toHaveLength(1);
  });

  it('el nombre de perfil no reemplaza el nombre que ya tenía el cliente', async () => {
    rasa.conversar.mockResolvedValue([]);
    await enviar(notificacion({ id: 'wamid.1', nombre: 'Juan Pérez' }));
    await enviar(notificacion({ id: 'wamid.2', nombre: 'Juancho 🔥' }));
    await esperarPendientes();

    const { rows } = await db.query('SELECT nombre FROM clientes WHERE wa_id = $1', [WA_ID]);
    expect(rows).toEqual([{ nombre: 'Juan Pérez' }]);
  });

  it('reenvía a Rasa el payload del botón pulsado', async () => {
    rasa.conversar.mockResolvedValue([]);
    const mensaje = { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: '/confirmar', title: 'Sí' } } };
    await enviar(notificacion({ mensaje }));
    await esperarPendientes();
    expect(rasa.conversar).toHaveBeenCalledWith(WA_ID, '/confirmar');
  });

  it('a un audio responde que solo lee texto, sin consultar a Rasa', async () => {
    await enviar(notificacion({ mensaje: { type: 'audio', audio: { id: 'MEDIA1', mime_type: 'audio/ogg' } } }));
    await esperarPendientes();

    expect(rasa.conversar).not.toHaveBeenCalled();
    const [saliente] = await mensajes('OUT');
    expect(saliente.contenido.text.body).toMatch(/solo puedo leer mensajes de texto/);
  });

  it('si Rasa no responde, avisa al cliente que lo atenderá un asesor', async () => {
    rasa.conversar.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:5005'));
    await enviar(notificacion());
    await esperarPendientes();

    const [saliente] = await mensajes('OUT');
    expect(saliente.contenido.text.body).toMatch(/Un asesor de MACHOBOL le escribirá/);
  });

  it('los avisos de estado (entregado, leído) se aceptan sin registrar nada', async () => {
    const estado = notificacion();
    estado.entry[0].changes[0].value = { messaging_product: 'whatsapp', statuses: [{ id: 'wamid.X', status: 'read', recipient_id: WA_ID }] };
    expect((await enviar(estado)).status).toBe(200);

    const { rows: [{ total }] } = await db.query('SELECT count(*)::int AS total FROM mensajes_whatsapp');
    expect(total).toBe(0);
  });

  describe('con credenciales de Meta (envío real a la Graph API)', () => {
    let fetchOriginal;
    beforeEach(() => {
      Object.assign(env.whatsapp, { accessToken: 'token-de-prueba', phoneNumberId: '1234567890' });
      fetchOriginal = global.fetch;
    });
    afterEach(() => {
      Object.assign(env.whatsapp, { accessToken: '', phoneNumberId: '' });
      global.fetch = fetchOriginal;
    });

    it('envía cada respuesta a la Graph API y guarda el id que asigna Meta', async () => {
      rasa.conversar.mockResolvedValue([{ text: 'Hola' }]);
      global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: 'wamid.SALIENTE' }] }), { status: 200 }));

      await enviar(notificacion());
      await esperarPendientes();

      const [url, opciones] = global.fetch.mock.calls[0];
      expect(url).toBe(`https://graph.facebook.com/${env.whatsapp.graphVersion}/1234567890/messages`);
      expect(opciones.headers.Authorization).toBe('Bearer token-de-prueba');
      expect(JSON.parse(opciones.body)).toEqual({
        messaging_product: 'whatsapp', recipient_type: 'individual', to: WA_ID, type: 'text', text: { body: 'Hola', preview_url: false },
      });
      expect((await mensajes('OUT'))[0].wa_message_id).toBe('wamid.SALIENTE');
    });

    it('si Meta rechaza el envío, el mensaje queda registrado con el error', async () => {
      rasa.conversar.mockResolvedValue([{ text: 'Hola' }]);
      global.fetch = jest.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'Invalid OAuth access token' } }), { status: 401 }),
      );

      await enviar(notificacion());
      await esperarPendientes();

      const [saliente] = await mensajes('OUT');
      expect(saliente.wa_message_id).toBeNull();
      expect(saliente.contenido.error).toBe('Graph API 401: Invalid OAuth access token');
    });
  });
});
