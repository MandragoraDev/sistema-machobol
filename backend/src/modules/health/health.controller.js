const db = require('../../config/db');

async function verificarSalud(req, res) {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', db: 'ok' });
  } catch (err) {
    req.log.error({ err }, 'La base de datos no responde');
    res.status(503).json({ status: 'error', db: 'error' });
  }
}

module.exports = { verificarSalud };
