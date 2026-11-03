// Traducción entre el formato de la Cloud API de WhatsApp y el canal REST de Rasa. Funciones puras.

// Límites de WhatsApp para mensajes interactivos y de texto.
const MAX_BOTONES = 3;
const MAX_TITULO_BOTON = 20;
const MAX_FILAS_LISTA = 10;
const MAX_TITULO_FILA = 24;
const MAX_CUERPO_INTERACTIVO = 1024;
const MAX_TEXTO = 4096;

const WA_ID = /^\d{8,15}$/;
const MAX_WA_MESSAGE_ID = 128;

const lista = (valor) => (Array.isArray(valor) ? valor : []);
const recortar = (texto, maximo) => (texto.length > maximo ? `${texto.slice(0, maximo - 1)}…` : texto);

/**
 * Mensajes de clientes contenidos en una notificación de Meta: `[{ waId, nombre, mensaje }]`.
 * Se ignoran los avisos de estado (enviado, entregado, leído) y cualquier entrada mal formada.
 */
function extraerMensajes(notificacion) {
  const mensajes = [];
  if (notificacion?.object !== 'whatsapp_business_account') return mensajes;
  for (const entrada of lista(notificacion.entry)) {
    for (const cambio of lista(entrada?.changes)) {
      if (cambio?.field !== 'messages') continue;
      const nombres = new Map(lista(cambio.value?.contacts).map((c) => [c?.wa_id, c?.profile?.name]));
      for (const mensaje of lista(cambio.value?.messages)) {
        const idValido = typeof mensaje?.id === 'string' && mensaje.id.length <= MAX_WA_MESSAGE_ID;
        if (!idValido || !WA_ID.test(mensaje.from ?? '')) continue;
        const nombre = nombres.get(mensaje.from);
        mensajes.push({ waId: mensaje.from, nombre: typeof nombre === 'string' ? nombre.slice(0, 120) : null, mensaje });
      }
    }
  }
  return mensajes;
}

/**
 * Texto que se reenvía a Rasa, o null si el tipo de mensaje no se procesa (audio, imagen, ubicación…).
 * En texto libre se quita la "/" inicial: en Rasa, "/intent{...}" fuerza un intent con entidades,
 * y eso solo debe llegar desde los botones que envía el propio bot.
 */
function textoParaRasa(mensaje) {
  switch (mensaje.type) {
    case 'text':
      return (mensaje.text?.body ?? '').replace(/^[\s/]+/, '').trim() || null;
    case 'interactive': {
      const respuesta = mensaje.interactive?.button_reply ?? mensaje.interactive?.list_reply;
      return respuesta?.id || respuesta?.title || null;
    }
    case 'button': // respuesta rápida de una plantilla
      return mensaje.button?.payload || mensaje.button?.text || null;
    default:
      return null;
  }
}

function mensajeDeTexto(texto) {
  return { type: 'text', text: { body: recortar(texto, MAX_TEXTO), preview_url: false } };
}

function interactivo(texto, botones) {
  const body = { text: recortar(texto, MAX_CUERPO_INTERACTIVO) };
  if (botones.length <= MAX_BOTONES) {
    const buttons = botones.map((b) => ({ type: 'reply', reply: { id: b.payload, title: recortar(b.title, MAX_TITULO_BOTON) } }));
    return { type: 'interactive', interactive: { type: 'button', body, action: { buttons } } };
  }
  const rows = botones.map((b) => ({ id: b.payload, title: recortar(b.title, MAX_TITULO_FILA) }));
  return {
    type: 'interactive',
    interactive: { type: 'list', body, action: { button: 'Ver opciones', sections: [{ title: 'Opciones', rows }] } },
  };
}

/**
 * Convierte las respuestas de Rasa en mensajes de WhatsApp: hasta 3 botones → botones de respuesta;
 * hasta 10 → lista desplegable; más → texto con las opciones numeradas.
 */
function aMensajesWhatsApp(respuestasRasa) {
  const salida = [];
  for (const respuesta of lista(respuestasRasa)) {
    const texto = typeof respuesta?.text === 'string' ? respuesta.text : '';
    const botones = lista(respuesta?.buttons).filter((b) => typeof b?.title === 'string' && typeof b?.payload === 'string');
    if (typeof respuesta?.image === 'string') {
      salida.push({ type: 'image', image: { link: respuesta.image, ...(texto && { caption: recortar(texto, MAX_CUERPO_INTERACTIVO) }) } });
    } else if (botones.length > 0 && botones.length <= MAX_FILAS_LISTA) {
      salida.push(interactivo(texto || 'Elija una opción:', botones));
    } else if (texto) {
      salida.push(mensajeDeTexto([texto, ...botones.map((b, i) => `${i + 1}. ${b.title}`)].join('\n')));
    }
  }
  return salida;
}

module.exports = { extraerMensajes, textoParaRasa, aMensajesWhatsApp, mensajeDeTexto };
