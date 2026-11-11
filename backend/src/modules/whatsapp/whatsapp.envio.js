const logger = require('../../config/logger');
const { enSegundoPlano } = require('../../utils/segundoPlano');
const whatsappRepository = require('./whatsapp.repository');
const graph = require('./whatsapp.graph');
const { mensajeDeTexto } = require('./whatsapp.mensajes');

/** Envía un mensaje (con su archivo, si lleva) y lo registra. Si Meta lo rechaza, queda registrado con el error. */
async function enviarYRegistrar(waId, clienteId, mensaje, archivo = null) {
  let enviado;
  try {
    enviado = await graph.enviar(waId, mensaje, archivo);
  } catch (err) {
    logger.error({ err, waId }, 'No se pudo enviar el mensaje de WhatsApp');
    await whatsappRepository.registrarSaliente(null, clienteId, { ...mensaje, error: err.message });
    return;
  }
  const contenido = enviado.archivoLocal ? { ...mensaje, archivo_local: enviado.archivoLocal } : mensaje;
  await whatsappRepository.registrarSaliente(enviado.id, clienteId, contenido);
}

/**
 * Mensaje que el sistema envía por su cuenta (p. ej. "pago recibido"). Va a la misma cola que las
 * respuestas del bot a ese cliente, así nunca se adelanta a una respuesta en curso.
 */
function notificar(waId, clienteId, texto) {
  enSegundoPlano(`whatsapp:${waId}`, () => enviarYRegistrar(waId, clienteId, mensajeDeTexto(texto)));
}

module.exports = { enviarYRegistrar, notificar };
