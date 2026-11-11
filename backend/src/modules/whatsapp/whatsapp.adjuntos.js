// Archivos que el asistente pide enviar con una respuesta `custom` de Rasa:
//   { "adjunto": "proforma" | "qr_pago", "pedido": "MCH-AAAA-NNNN" }
// Rasa nunca genera ni ve los archivos: los arma el backend, y solo si el pedido es del cliente que conversa.
const pedidosService = require('../pedidos/pedidos.service');
const pagosService = require('../pagos/pagos.service');

const GENERADORES = {
  async proforma(codigo, waId) {
    const pedido = await pedidosService.obtenerDelCliente(codigo, waId);
    const { buffer, nombre } = await pedidosService.proformaPdf(pedido);
    return {
      mensaje: { type: 'document', document: { filename: nombre, caption: `Proforma ${codigo}` } },
      archivo: { buffer, mime: 'application/pdf', nombre },
    };
  },

  async qr_pago(codigo, waId) {
    await pedidosService.obtenerDelCliente(codigo, waId);
    const { buffer, texto } = await pagosService.qrVigente(codigo);
    return {
      mensaje: { type: 'image', image: { caption: texto } },
      archivo: { buffer, mime: 'image/png', nombre: `QR ${codigo}.png` },
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
