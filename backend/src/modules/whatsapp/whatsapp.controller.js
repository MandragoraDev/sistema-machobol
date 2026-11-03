const env = require('../../config/env');
const AppError = require('../../utils/AppError');
const { secretoValido } = require('../../utils/secretos');
const { firmaValida } = require('./whatsapp.firma');
const whatsappService = require('./whatsapp.service');

/** GET: Meta verifica la URL al suscribir el webhook y espera recibir `hub.challenge` tal cual. */
function verificar(req, res) {
  const { 'hub.mode': modo, 'hub.verify_token': token, 'hub.challenge': desafio } = req.query;
  if (modo !== 'subscribe' || !secretoValido(token, env.whatsapp.verifyToken)) {
    throw new AppError(403, 'Token de verificación inválido.');
  }
  res.type('text/plain').send(String(desafio ?? ''));
}

/** POST: notificación de Meta. Se verifica la firma, se registran los mensajes y se responde 200 sin esperar a Rasa. */
async function recibir(req, res) {
  if (!firmaValida(req.cuerpoCrudo, req.get('x-hub-signature-256'), env.whatsapp.appSecret)) {
    throw new AppError(401, 'Firma inválida.');
  }
  await whatsappService.recibirNotificacion(req.body);
  res.sendStatus(200);
}

module.exports = { verificar, recibir };
