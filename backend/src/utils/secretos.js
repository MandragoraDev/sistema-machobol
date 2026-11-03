const crypto = require('node:crypto');

const huella = (valor) => crypto.createHash('sha256').update(valor).digest();

/** Compara un secreto recibido con el esperado en tiempo constante (las huellas igualan la longitud). */
function secretoValido(recibido, esperado) {
  return typeof recibido === 'string' && recibido.length > 0 && crypto.timingSafeEqual(huella(recibido), huella(esperado));
}

module.exports = { secretoValido };
