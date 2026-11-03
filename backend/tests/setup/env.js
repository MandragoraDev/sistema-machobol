// Corre antes de cada archivo de pruebas, antes de cargar la app.
// Las pruebas usan TEST_DATABASE_URL y jamás la base de desarrollo.
const path = require('node:path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'secreto-solo-para-pruebas-con-mas-de-32-caracteres';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://sin-base-de-pruebas@localhost:1/no_existe_test';
