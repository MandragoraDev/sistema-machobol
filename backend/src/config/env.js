const path = require('node:path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

function requerida(nombre) {
  const valor = process.env[nombre];
  if (!valor) {
    throw new Error(`Falta la variable de entorno ${nombre}. Copia .env.example a .env y complétala.`);
  }
  return valor;
}

function secreto(nombre) {
  const valor = requerida(nombre);
  if (valor.length < 32) {
    throw new Error(`${nombre} debe tener al menos 32 caracteres.`);
  }
  return valor;
}

const whatsapp = {
  verifyToken: requerida('WHATSAPP_VERIFY_TOKEN'),
  appSecret: requerida('WHATSAPP_APP_SECRET'),
  // Sin token de acceso, las respuestas del bot no se envían a Meta: solo se registran (modo simulado).
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
  graphVersion: process.env.WHATSAPP_GRAPH_VERSION || 'v24.0',
};
if (Boolean(whatsapp.accessToken) !== Boolean(whatsapp.phoneNumberId)) {
  throw new Error('Define WHATSAPP_ACCESS_TOKEN y WHATSAPP_PHONE_NUMBER_ID juntos (o ninguno, para el modo simulado).');
}

function entero(nombre, porDefecto) {
  const valor = Number(process.env[nombre] || porDefecto);
  if (!Number.isInteger(valor) || valor <= 0) {
    throw new Error(`${nombre} debe ser un entero positivo.`);
  }
  return valor;
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 4000,
  databaseUrl: requerida('DATABASE_URL'),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  // Proxies de confianza delante de la API (en producción, 1: Caddy). Con ellos, req.ip es la IP real del cliente y el
  // límite de intentos de inicio de sesión no trata a todos los usuarios como si fueran el proxy.
  trustProxy: Number(process.env.TRUST_PROXY || 0),
  logLevel: process.env.LOG_LEVEL || 'info',
  jwtSecret: secreto('JWT_SECRET'),
  jwtExpiraEn: process.env.JWT_EXPIRES_IN || '8h',
  // Secreto compartido con el servidor de acciones de Rasa (header X-Service-Token).
  serviceToken: secreto('SERVICE_TOKEN'),
  rasaUrl: (process.env.RASA_URL || 'http://localhost:5005').replace(/\/+$/, ''),
  whatsapp,
  // Días que el precio de una cotización queda congelado.
  cotizacionValidezDias: entero('COTIZACION_VALIDEZ_DIAS', 15),
};
