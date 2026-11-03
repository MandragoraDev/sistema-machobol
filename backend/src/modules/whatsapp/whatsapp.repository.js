const { query } = require('../../config/db');

/** Alta automática del cliente la primera vez que escribe. El nombre de perfil de WhatsApp solo se usa si aún no tiene uno. */
async function registrarCliente(waId, nombre) {
  const { rows: [cliente] } = await query(
    `INSERT INTO clientes (wa_id, nombre) VALUES ($1, $2)
     ON CONFLICT (wa_id) DO UPDATE SET nombre = COALESCE(clientes.nombre, EXCLUDED.nombre)
     RETURNING id`,
    [waId, nombre],
  );
  return cliente.id;
}

/**
 * Guarda un mensaje entrante. Devuelve false si ya estaba registrado: Meta reenvía el mismo webhook
 * cuando no recibe un 200 a tiempo, y el índice único sobre wa_message_id evita procesarlo dos veces.
 */
async function registrarEntrante(waMessageId, clienteId, contenido) {
  const { rowCount } = await query(
    `INSERT INTO mensajes_whatsapp (wa_message_id, cliente_id, direccion, contenido)
     VALUES ($1, $2, 'IN', $3)
     ON CONFLICT (wa_message_id) DO NOTHING`,
    [waMessageId, clienteId, contenido],
  );
  return rowCount === 1;
}

/** Guarda una respuesta del bot. `waMessageId` es null si el envío falló antes de que Meta le asignara un id. */
async function registrarSaliente(waMessageId, clienteId, contenido) {
  await query(
    `INSERT INTO mensajes_whatsapp (wa_message_id, cliente_id, direccion, contenido)
     VALUES ($1, $2, 'OUT', $3)`,
    [waMessageId, clienteId, contenido],
  );
}

module.exports = { registrarCliente, registrarEntrante, registrarSaliente };
