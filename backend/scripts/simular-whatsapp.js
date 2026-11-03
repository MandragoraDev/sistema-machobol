/**
 * Simulador de WhatsApp: envía al webhook notificaciones con el mismo formato y la misma firma HMAC
 * que Meta, y muestra las respuestas del bot (las lee de la tabla mensajes_whatsapp).
 * Sirve para probar el circuito completo sin túnel ni cuenta de Meta.
 *
 *   npm run whatsapp:simular                       chat interactivo
 *   npm run whatsapp:simular -- "hola"             envía un mensaje y muestra la respuesta
 *
 * Opciones: --numero 59170000001  --nombre "Cliente de prueba"
 *           --repetir         envía cada mensaje dos veces con el mismo wa_message_id (deduplicación)
 *           --firma-invalida  firma con un secreto equivocado (la API debe responder 401)
 */
const { parseArgs } = require('node:util');
const readline = require('node:readline/promises');
const { randomUUID } = require('node:crypto');
const env = require('../src/config/env');
const { pool, query } = require('../src/config/db');
const { firmar } = require('../src/modules/whatsapp/whatsapp.firma');

const { values: opciones, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    numero: { type: 'string', default: '59170000001' },
    nombre: { type: 'string', default: 'Cliente de prueba' },
    repetir: { type: 'boolean', default: false },
    'firma-invalida': { type: 'boolean', default: false },
  },
});

const URL_WEBHOOK = `http://localhost:${env.port}/api/webhooks/whatsapp`;
const SILENCIO_MS = 1500; // el bot terminó de responder si pasa este tiempo sin mensajes nuevos
const ESPERA_MAXIMA_MS = 40_000;

function notificacion(mensaje) {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'WABA_SIMULADA',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '59100000000', phone_number_id: 'SIMULADO' },
          contacts: [{ profile: { name: opciones.nombre }, wa_id: opciones.numero }],
          messages: [{
            from: opciones.numero,
            id: `wamid.SIM${randomUUID().replaceAll('-', '')}`,
            timestamp: String(Math.floor(Date.now() / 1000)),
            ...mensaje,
          }],
        },
      }],
    }],
  };
}

async function enviarWebhook(cuerpo) {
  const json = JSON.stringify(cuerpo);
  const secreto = opciones['firma-invalida'] ? 'secreto-equivocado' : env.whatsapp.appSecret;
  const respuesta = await fetch(URL_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': firmar(json, secreto) },
    body: json,
  });
  return respuesta.status;
}

async function ultimoIdMensaje() {
  const { rows: [{ id }] } = await query(
    `SELECT COALESCE(max(m.id), 0) AS id FROM mensajes_whatsapp m
     JOIN clientes c ON c.id = m.cliente_id WHERE c.wa_id = $1`,
    [opciones.numero],
  );
  return id;
}

async function esperarRespuestas(desdeId) {
  const inicio = Date.now();
  const respuestas = [];
  let ultimoId = desdeId;
  let ultimaLlegada = null;
  for (;;) {
    const { rows } = await query(
      `SELECT m.id, m.contenido FROM mensajes_whatsapp m
       JOIN clientes c ON c.id = m.cliente_id
       WHERE c.wa_id = $1 AND m.direccion = 'OUT' AND m.id > $2 ORDER BY m.id`,
      [opciones.numero, ultimoId],
    );
    if (rows.length > 0) {
      respuestas.push(...rows.map((r) => r.contenido));
      ultimoId = rows.at(-1).id;
      ultimaLlegada = Date.now();
    }
    const terminado = ultimaLlegada ? Date.now() - ultimaLlegada > SILENCIO_MS : Date.now() - inicio > ESPERA_MAXIMA_MS;
    if (terminado) return respuestas;
    await new Promise((resolver) => setTimeout(resolver, 250));
  }
}

/** Imprime una respuesta del bot y devuelve sus botones (para poder pulsarlos escribiendo su número). */
function mostrar(contenido) {
  const sangria = (texto) => texto.replaceAll('\n', '\n     ');
  let botones = [];
  if (contenido.type === 'text') {
    console.log(`Bot: ${sangria(contenido.text.body)}`);
  } else if (contenido.type === 'interactive') {
    const { interactive } = contenido;
    console.log(`Bot: ${sangria(interactive.body.text)}`);
    botones = interactive.type === 'button'
      ? interactive.action.buttons.map((b) => b.reply)
      : interactive.action.sections.flatMap((s) => s.rows);
    botones.forEach((b, i) => console.log(`     [${i + 1}] ${b.title}`));
  } else {
    console.log(`Bot: (${contenido.type}) ${JSON.stringify(contenido[contenido.type])}`);
  }
  if (contenido.error) console.log(`     ⚠ No se pudo enviar a Meta: ${contenido.error}`);
  return botones;
}

async function conversar(mensaje) {
  const desde = await ultimoIdMensaje();
  const cuerpo = notificacion(mensaje);
  const estado = await enviarWebhook(cuerpo);
  if (estado !== 200) {
    console.log(`  (el webhook respondió ${estado})`);
    return [];
  }
  if (opciones.repetir) {
    const estadoRepetido = await enviarWebhook(cuerpo);
    console.log(`  (reenvío con el mismo wa_message_id: el webhook respondió ${estadoRepetido})`);
  }
  const respuestas = await esperarRespuestas(desde);
  if (respuestas.length === 0) {
    console.log('  (sin respuesta: ¿están levantados la API, Rasa y el servidor de acciones?)');
  }
  let botones = [];
  for (const contenido of respuestas) botones = mostrar(contenido);
  return botones;
}

async function main() {
  console.log(`Simulando al cliente ${opciones.nombre} (${opciones.numero}) contra ${URL_WEBHOOK}`);
  if (positionals.length > 0) {
    console.log(`Usted: ${positionals.join(' ')}`);
    await conversar({ type: 'text', text: { body: positionals.join(' ') } });
    return;
  }

  console.log('Escriba un mensaje, o el número de un botón para pulsarlo. "salir" para terminar.\n');
  const consola = readline.createInterface({ input: process.stdin, output: process.stdout });
  let botones = [];
  try {
    for (;;) {
      const linea = (await consola.question('Usted: ')).trim();
      if (linea === 'salir') break;
      if (!linea) continue;
      const boton = /^\d+$/.test(linea) ? botones[Number(linea) - 1] : undefined;
      const mensaje = boton
        ? { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: boton.id, title: boton.title } } }
        : { type: 'text', text: { body: linea } };
      if (boton) console.log(`  (pulsó «${boton.title}»)`);
      botones = await conversar(mensaje);
    }
  } finally {
    consola.close();
  }
}

main()
  .catch((err) => {
    console.error(err.cause?.code === 'ECONNREFUSED' ? `La API no responde en ${URL_WEBHOOK}. ¿Está levantada (npm run dev)?` : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
