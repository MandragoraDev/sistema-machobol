const { randomUUID } = require('node:crypto');
const env = require('../../config/env');
const logger = require('../../config/logger');

/**
 * Envía un mensaje por la Cloud API (Graph API) y devuelve su wa_message_id.
 * En modo simulado (sin WHATSAPP_ACCESS_TOKEN) no sale nada hacia Meta: devuelve un id "sim.*" y el
 * mensaje queda solo en la base de datos, de donde lo lee el simulador.
 */
async function enviar(waId, mensaje) {
  const { accessToken, phoneNumberId, graphVersion } = env.whatsapp;
  if (!accessToken) {
    logger.debug({ waId, mensaje }, 'WhatsApp en modo simulado: mensaje no enviado a Meta');
    return `sim.${randomUUID()}`;
  }

  const respuesta = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: waId, ...mensaje }),
    signal: AbortSignal.timeout(15_000),
  });
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    throw new Error(`Graph API ${respuesta.status}: ${datos.error?.message ?? 'respuesta inesperada'}`);
  }
  return datos.messages?.[0]?.id ?? null;
}

module.exports = { enviar };
