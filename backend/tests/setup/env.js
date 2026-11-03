// Corre antes de cada archivo de pruebas, antes de cargar la app.
// Las pruebas usan TEST_DATABASE_URL y jamás la base de desarrollo.
const path = require('node:path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'secreto-solo-para-pruebas-con-mas-de-32-caracteres';
process.env.SERVICE_TOKEN ||= 'token-de-servicio-solo-para-pruebas-32+';
process.env.WHATSAPP_VERIFY_TOKEN ||= 'verificacion-de-pruebas';
process.env.WHATSAPP_APP_SECRET ||= 'secreto-de-app-de-pruebas';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://sin-base-de-pruebas@localhost:1/no_existe_test';

// Las pruebas nunca envían mensajes reales a Meta ni dependen de que Rasa esté levantado.
process.env.WHATSAPP_ACCESS_TOKEN = '';
process.env.WHATSAPP_PHONE_NUMBER_ID = '';
process.env.RASA_URL = 'http://127.0.0.1:9';
