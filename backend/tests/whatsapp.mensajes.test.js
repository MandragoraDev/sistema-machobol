const { firmar, firmaValida } = require('../src/modules/whatsapp/whatsapp.firma');
const { extraerMensajes, textoParaRasa, aMensajesWhatsApp } = require('../src/modules/whatsapp/whatsapp.mensajes');

describe('Firma HMAC de Meta', () => {
  const cuerpo = Buffer.from('{"object":"whatsapp_business_account"}');

  it('acepta la firma calculada con el App Secret', () => {
    expect(firmaValida(cuerpo, firmar(cuerpo, 'secreto'), 'secreto')).toBe(true);
  });

  it.each([
    ['otro secreto', firmar(cuerpo, 'otro')],
    ['sin prefijo sha256=', firmar(cuerpo, 'secreto').slice(7)],
    ['hex truncado', firmar(cuerpo, 'secreto').slice(0, -2)],
    ['cabecera ausente', undefined],
  ])('rechaza: %s', (_caso, cabecera) => {
    expect(firmaValida(cuerpo, cabecera, 'secreto')).toBe(false);
  });

  it('rechaza un cuerpo alterado después de firmar', () => {
    const firma = firmar(cuerpo, 'secreto');
    expect(firmaValida(Buffer.from('{"object":"otra cosa"}'), firma, 'secreto')).toBe(false);
  });
});

describe('extraerMensajes', () => {
  const notificacion = (value) => ({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value }] }] });

  it('devuelve cada mensaje con el wa_id y el nombre de perfil', () => {
    const mensaje = { from: '59171234567', id: 'wamid.A', type: 'text', text: { body: 'hola' } };
    const resultado = extraerMensajes(notificacion({ contacts: [{ wa_id: '59171234567', profile: { name: 'Juan' } }], messages: [mensaje] }));
    expect(resultado).toEqual([{ waId: '59171234567', nombre: 'Juan', mensaje }]);
  });

  it('ignora avisos de estado, wa_id inválidos y notificaciones de otro tipo', () => {
    expect(extraerMensajes(notificacion({ statuses: [{ id: 'wamid.A', status: 'read' }] }))).toEqual([]);
    expect(extraerMensajes(notificacion({ messages: [{ from: '+591 7123', id: 'wamid.B', type: 'text' }] }))).toEqual([]);
    expect(extraerMensajes({ object: 'page', entry: [] })).toEqual([]);
    expect(extraerMensajes({ object: 'whatsapp_business_account', entry: 'no es una lista' })).toEqual([]);
  });
});

describe('textoParaRasa', () => {
  it('quita la "/" inicial del texto libre para que el cliente no pueda forzar un intent', () => {
    expect(textoParaRasa({ type: 'text', text: { body: '/cotizar_porton{"alto": "99"}' } })).toBe('cotizar_porton{"alto": "99"}');
    expect(textoParaRasa({ type: 'text', text: { body: '  4 x 2,20 ' } })).toBe('4 x 2,20');
  });

  it('reenvía el payload de los botones del bot', () => {
    const mensaje = { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: '/confirmar', title: 'Sí' } } };
    expect(textoParaRasa(mensaje)).toBe('/confirmar');
  });

  it('devuelve null para audio, imágenes y textos vacíos', () => {
    expect(textoParaRasa({ type: 'audio', audio: { id: '1' } })).toBeNull();
    expect(textoParaRasa({ type: 'text', text: { body: ' / ' } })).toBeNull();
  });
});

describe('aMensajesWhatsApp', () => {
  const botones = (n) => Array.from({ length: n }, (_, i) => ({ title: `Opción ${i + 1}`, payload: `/opcion_${i + 1}` }));

  it('texto simple', () => {
    expect(aMensajesWhatsApp([{ recipient_id: 'x', text: 'Hola' }])).toEqual([
      { type: 'text', text: { body: 'Hola', preview_url: false } },
    ]);
  });

  it('hasta 3 botones → botones de respuesta, con el título recortado a 20 caracteres', () => {
    const [mensaje] = aMensajesWhatsApp([{ text: '¿Confirma?', buttons: [{ title: 'Sí, son correctas', payload: '/confirmar' }, { title: 'Un título demasiado largo', payload: '/negar' }] }]);
    expect(mensaje.interactive.type).toBe('button');
    expect(mensaje.interactive.body.text).toBe('¿Confirma?');
    expect(mensaje.interactive.action.buttons).toEqual([
      { type: 'reply', reply: { id: '/confirmar', title: 'Sí, son correctas' } },
      { type: 'reply', reply: { id: '/negar', title: 'Un título demasiado…' } },
    ]);
  });

  it('de 4 a 10 botones → lista; más de 10 → texto con opciones numeradas', () => {
    const [lista] = aMensajesWhatsApp([{ text: 'Elija', buttons: botones(5) }]);
    expect(lista.interactive.type).toBe('list');
    expect(lista.interactive.action.sections[0].rows).toHaveLength(5);

    const [texto] = aMensajesWhatsApp([{ text: 'Elija', buttons: botones(11) }]);
    expect(texto.type).toBe('text');
    expect(texto.text.body).toMatch(/^Elija\n1\. Opción 1\n/);
  });

  it('imágenes y respuestas sin contenido utilizable', () => {
    expect(aMensajesWhatsApp([{ image: 'https://ejemplo.bo/p.png' }])).toEqual([{ type: 'image', image: { link: 'https://ejemplo.bo/p.png' } }]);
    expect(aMensajesWhatsApp([{ custom: { algo: 1 } }])).toEqual([]);
    expect(aMensajesWhatsApp(undefined)).toEqual([]);
  });
});
