const { z, decimal } = require('../../utils/validar');

const texto = (campo, max = 500) => z.string({ error: `Ingresa ${campo}` }).trim().min(2, `Ingresa ${campo}`).max(max);

// Datos del negocio que responde el bot y número del encargado que recibe los avisos.
const configuracion = z.object({
  ciudad: texto('la ciudad', 80),
  direccion: texto('la dirección'),
  maps_url: z.url({ protocol: /^https$/, error: 'Pega el enlace de Google Maps (https://…)' }).max(300).nullable(),
  horarios: texto('los horarios de atención'),
  formas_pago: texto('las formas de pago'),
  tiempo_fabricacion: texto('el tiempo de fabricación'),
  cobertura: texto('dónde instalan'),
  anticipo_pct: decimal(2, { min: 1, max: 100, mensaje: 'Ingresa el porcentaje de anticipo (1 a 100)' }),
  whatsapp_avisos: z
    .string()
    .trim()
    .transform((valor) => valor.replace(/[\s+()-]/g, ''))
    .pipe(z.string().regex(/^\d{8,15}$/, 'Número de WhatsApp con código de país, solo dígitos (p. ej. 59171234567)'))
    .nullable(),
});

module.exports = { configuracion };
