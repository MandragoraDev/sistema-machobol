const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const env = require('../../config/env');
const logger = require('../../config/logger');

// En modo simulado, los archivos (proformas, QR) se guardan aquí para poder abrirlos.
const CARPETA_SIMULADA = path.resolve(__dirname, '../../../tmp/whatsapp-simulado');

function urlGraph(recurso) {
  const { graphVersion, phoneNumberId } = env.whatsapp;
  return `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/${recurso}`;
}

async function leerRespuesta(respuesta, operacion) {
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    throw new Error(`Graph API ${operacion} ${respuesta.status}: ${datos.error?.message ?? 'respuesta inesperada'}`);
  }
  return datos;
}

/** Sube un archivo a WhatsApp y devuelve su id de media (así no hace falta una URL pública). */
async function subirMedia(archivo) {
  const formulario = new FormData();
  formulario.append('messaging_product', 'whatsapp');
  formulario.append('type', archivo.mime);
  formulario.append('file', new Blob([archivo.buffer], { type: archivo.mime }), archivo.nombre);
  const respuesta = await fetch(urlGraph('media'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.whatsapp.accessToken}` },
    body: formulario,
    signal: AbortSignal.timeout(30_000),
  });
  return (await leerRespuesta(respuesta, 'media')).id;
}

async function guardarCopiaLocal(archivo) {
  if (env.nodeEnv === 'test') return null;
  await fs.mkdir(CARPETA_SIMULADA, { recursive: true });
  const ruta = path.join(CARPETA_SIMULADA, archivo.nombre);
  await fs.writeFile(ruta, archivo.buffer);
  return ruta;
}

/**
 * Envía un mensaje por la Cloud API (Graph API). Si lleva `archivo` ({ buffer, mime, nombre }), primero lo sube.
 * Devuelve `{ id, archivoLocal }`: el wa_message_id asignado por Meta.
 * En modo simulado (sin WHATSAPP_ACCESS_TOKEN) no sale nada hacia Meta: el id es "sim.*" y el archivo
 * se guarda en backend/tmp/whatsapp-simulado.
 */
async function enviar(waId, mensaje, archivo = null) {
  if (!env.whatsapp.accessToken) {
    logger.debug({ waId, mensaje }, 'WhatsApp en modo simulado: mensaje no enviado a Meta');
    return { id: `sim.${randomUUID()}`, archivoLocal: archivo ? await guardarCopiaLocal(archivo) : null };
  }

  let cuerpo = mensaje;
  if (archivo) {
    cuerpo = { ...mensaje, [mensaje.type]: { ...mensaje[mensaje.type], id: await subirMedia(archivo) } };
  }
  const respuesta = await fetch(urlGraph('messages'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.whatsapp.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: waId, ...cuerpo }),
    signal: AbortSignal.timeout(15_000),
  });
  const datos = await leerRespuesta(respuesta, 'messages');
  return { id: datos.messages?.[0]?.id ?? null, archivoLocal: null };
}

module.exports = { enviar };
