const env = require('../../config/env');

/** Envía el mensaje del cliente al canal REST de Rasa (el wa_id identifica la conversación) y devuelve sus respuestas. */
async function conversar(waId, texto) {
  const respuesta = await fetch(`${env.rasaUrl}/webhooks/rest/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sender: waId, message: texto }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!respuesta.ok) {
    throw new Error(`Rasa respondió ${respuesta.status}`);
  }
  return respuesta.json();
}

module.exports = { conversar };
