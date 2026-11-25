// Avisos al encargado del negocio por WhatsApp: madera insuficiente, stock bajo y solicitudes de reunión.
// El número se configura en Configuración (configuracion_negocio.whatsapp_avisos). Sin número, el aviso solo queda en
// el log: el panel muestra igualmente las alertas en el Dashboard.
//
// El encargado no es un cliente, así que sus mensajes no se guardan en mensajes_whatsapp.
// Con WhatsApp real, un aviso fuera de la ventana de 24 h necesita una plantilla aprobada por Meta (Sprint 6, parte B).
const logger = require('../../config/logger');
const { enSegundoPlano } = require('../../utils/segundoPlano');
const configuracionRepository = require('../configuracion/configuracion.repository');
const graph = require('../whatsapp/whatsapp.graph');
const { mensajeDeTexto } = require('../whatsapp/whatsapp.mensajes');

const SECCIONES = {
  MADERA_INSUFICIENTE: '⚠️ Madera insuficiente',
  STOCK_BAJO: '⚠️ Stock bajo',
  REUNION_SOLICITADA: '📅 Nueva solicitud de reunión',
};

/** Envía el aviso en segundo plano (no demora la respuesta ni la hace fallar). */
function avisarEncargado(tipo, texto) {
  enSegundoPlano('avisos:encargado', async () => {
    const configuracion = await configuracionRepository.obtener();
    const numero = configuracion?.whatsapp_avisos;
    logger.warn({ aviso: tipo, numero: numero ?? null }, texto);
    if (!numero) return;
    try {
      await graph.enviar(numero, mensajeDeTexto(`*${SECCIONES[tipo]}*\n${texto}`));
    } catch (err) {
      logger.error({ err, aviso: tipo }, 'No se pudo enviar el aviso al encargado');
    }
  });
}

module.exports = { avisarEncargado };
