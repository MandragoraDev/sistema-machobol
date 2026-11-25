// Archivos que el asistente pide enviar con una respuesta `custom` de Rasa:
//   { "adjunto": "proforma", "pedido": "MCH-AAAA-NNNN" }
// Rasa nunca genera ni ve los archivos: los arma el backend, y solo si el pedido es del cliente que conversa.
const pedidosService = require('../pedidos/pedidos.service');

const GENERADORES = {
  async proforma(codigo, waId) {
    const pedido = await pedidosService.obtenerDelCliente(codigo, waId);
    const { buffer, nombre } = await pedidosService.proformaPdf(pedido);
    return {
      mensaje: { type: 'document', document: { filename: nombre, caption: `Proforma ${codigo}` } },
      archivo: { buffer, mime: 'application/pdf', nombre },
    };
  },

};

/** Devuelve `{ mensaje, archivo }` listo para whatsappEnvio.enviarYRegistrar. */
async function prepararAdjunto(waId, { tipo, pedido }) {
  const generar = GENERADORES[tipo];
  if (!generar) {
    throw new Error(`Adjunto desconocido: ${tipo}`);
  }
  return generar(pedido, waId);
}

module.exports = { prepararAdjunto };
