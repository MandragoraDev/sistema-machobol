const logger = require('../config/logger');

// Trabajo que continúa después de responder la petición HTTP (p. ej. contestar un WhatsApp).
const pendientes = new Set();
const colas = new Map();

/**
 * Ejecuta `tarea` en segundo plano. Las tareas con la misma `clave` corren una tras otra, en orden
 * de llegada: así las respuestas a un mismo cliente no se cruzan. Los errores se registran y no se propagan.
 */
function enSegundoPlano(clave, tarea) {
  const anterior = colas.get(clave) ?? Promise.resolve();
  const actual = anterior.then(tarea).catch((err) => logger.error({ err, clave }, 'Falló una tarea en segundo plano'));
  colas.set(clave, actual);
  pendientes.add(actual);
  actual.then(() => {
    pendientes.delete(actual);
    if (colas.get(clave) === actual) colas.delete(clave);
  });
}

/** Espera a que terminen todas las tareas en curso (al apagar la API y en las pruebas). */
async function esperarPendientes() {
  while (pendientes.size > 0) {
    await Promise.all(pendientes);
  }
}

module.exports = { enSegundoPlano, esperarPendientes };
