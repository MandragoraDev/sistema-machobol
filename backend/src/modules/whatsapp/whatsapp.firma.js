const crypto = require('node:crypto');

const PREFIJO = 'sha256=';

/** Firma de Meta: `X-Hub-Signature-256: sha256=<HMAC-SHA256 en hex del cuerpo crudo, con el App Secret>`. */
function firmar(cuerpo, secreto) {
  return PREFIJO + crypto.createHmac('sha256', secreto).update(cuerpo).digest('hex');
}

/** Verifica la firma de un webhook comparando en tiempo constante. */
function firmaValida(cuerpoCrudo, cabecera, secreto) {
  if (!Buffer.isBuffer(cuerpoCrudo) || typeof cabecera !== 'string' || !cabecera.startsWith(PREFIJO)) {
    return false;
  }
  const recibida = Buffer.from(cabecera.slice(PREFIJO.length), 'hex');
  const esperada = crypto.createHmac('sha256', secreto).update(cuerpoCrudo).digest();
  return recibida.length === esperada.length && crypto.timingSafeEqual(recibida, esperada);
}

module.exports = { firmar, firmaValida };
