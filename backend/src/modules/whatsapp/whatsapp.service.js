const logger = require('../../config/logger');
const { enSegundoPlano } = require('../../utils/segundoPlano');
const whatsappRepository = require('./whatsapp.repository');
const rasa = require('./whatsapp.rasa');
const { enviarYRegistrar } = require('./whatsapp.envio');
const { prepararAdjunto } = require('./whatsapp.adjuntos');
const { extraerMensajes, textoParaRasa, aMensajesWhatsApp, mensajeDeTexto } = require('./whatsapp.mensajes');

const SOLO_TEXTO = 'Por ahora solo puedo leer mensajes de texto. ¿Me lo escribe, por favor?';
const SIN_ASISTENTE = 'Disculpe, en este momento no puedo responderle. Un asesor de MACHOBOL le escribirá en breve.';
const SIN_ADJUNTO = 'No pude adjuntar el documento. Un asesor se lo enviará en breve.';

/**
 * Registra los mensajes de una notificación de Meta y agenda su respuesta en segundo plano.
 * El registro ocurre antes de responder 200: si la BD falla, Meta recibe un error y reintenta más tarde.
 * Un mensaje ya registrado (webhook repetido) se ignora.
 */
async function recibirNotificacion(notificacion) {
  for (const { waId, nombre, mensaje } of extraerMensajes(notificacion)) {
    const clienteId = await whatsappRepository.registrarCliente(waId, nombre);
    const esNuevo = await whatsappRepository.registrarEntrante(mensaje.id, clienteId, mensaje);
    if (!esNuevo) {
      logger.info({ waMessageId: mensaje.id }, 'Mensaje de WhatsApp repetido: se ignora');
      continue;
    }
    enSegundoPlano(`whatsapp:${waId}`, () => responder(waId, clienteId, mensaje));
  }
}

async function responder(waId, clienteId, mensaje) {
  const texto = textoParaRasa(mensaje);
  let respuestas;
  if (texto === null) {
    respuestas = [mensajeDeTexto(SOLO_TEXTO)];
  } else {
    try {
      respuestas = aMensajesWhatsApp(await rasa.conversar(waId, texto));
    } catch (err) {
      logger.error({ err, waId }, 'Rasa no respondió');
      respuestas = [mensajeDeTexto(SIN_ASISTENTE)];
    }
  }
  for (const respuesta of respuestas) {
    if (respuesta.type !== 'adjunto') {
      await enviarYRegistrar(waId, clienteId, respuesta);
      continue;
    }
    let preparado;
    try {
      preparado = await prepararAdjunto(waId, respuesta.adjunto);
    } catch (err) {
      logger.error({ err, waId, adjunto: respuesta.adjunto }, 'No se pudo preparar el adjunto');
      await enviarYRegistrar(waId, clienteId, mensajeDeTexto(SIN_ADJUNTO));
      continue;
    }
    await enviarYRegistrar(waId, clienteId, preparado.mensaje, preparado.archivo);
  }
}

module.exports = { recibirNotificacion };
