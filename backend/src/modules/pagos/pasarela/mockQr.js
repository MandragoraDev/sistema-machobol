// Pasarela de pagos QR SIMULADA. Una pasarela real debe ofrecer la misma interfaz (PaymentGateway):
//   crearCobro({ referencia, monto, expiraEn }) → { transaccionId, qrPayload }
//   imagenQr(qrPayload)                       → Buffer PNG del QR que se muestra al cliente
//   verificarCallback(cuerpoCrudo, firma)     → { transaccionId, estado: 'PAGADO' | 'FALLIDO', monto }
const crypto = require('node:crypto');
const QRCode = require('qrcode');
const env = require('../../../config/env');
const AppError = require('../../../utils/AppError');
const { secretoValido } = require('../../../utils/secretos');
const { z, validar } = require('../../../utils/validar');

const CABECERA_FIRMA = 'X-Pasarela-Firma';

const callback = z.object({
  transaccion_id: z.string().min(1).max(64),
  estado: z.enum(['PAGADO', 'FALLIDO']),
  monto: z.string().regex(/^\d+\.\d{2}$/, 'Monto con 2 decimales, como texto'),
  pagado_en: z.string().optional(),
});

function firmar(cuerpo) {
  return crypto.createHmac('sha256', env.pagos.webhookSecret).update(cuerpo).digest('hex');
}

async function crearCobro({ referencia, monto, expiraEn }) {
  const transaccionId = `MOCK-${crypto.randomUUID()}`;
  // Un banco real usa su propio formato; este es legible para depurar.
  const qrPayload = ['MOCKQR', 'MACHOBOL', referencia, transaccionId, `BOB ${monto}`, expiraEn.toISOString()].join('|');
  return { transaccionId, qrPayload };
}

function imagenQr(qrPayload) {
  return QRCode.toBuffer(qrPayload, { type: 'png', width: 480, margin: 2, errorCorrectionLevel: 'M' });
}

/** Valida la firma HMAC-SHA256 del callback (hex, en X-Pasarela-Firma) y su contenido. */
function verificarCallback(cuerpoCrudo, firma) {
  if (!Buffer.isBuffer(cuerpoCrudo) || !secretoValido(firma, firmar(cuerpoCrudo))) {
    throw new AppError(401, 'Firma de la pasarela inválida.');
  }
  let contenido;
  try {
    contenido = JSON.parse(cuerpoCrudo);
  } catch {
    throw new AppError(400, 'El callback no es un JSON válido.');
  }
  const datos = validar(callback, contenido);
  return { transaccionId: datos.transaccion_id, estado: datos.estado, monto: datos.monto };
}

/** Solo para desarrollo: arma el callback firmado que enviaría el banco al cobrar (o rechazar) el QR. */
function simularCallback({ transaccionId, monto, estado = 'PAGADO' }) {
  const cuerpo = Buffer.from(JSON.stringify({ transaccion_id: transaccionId, estado, monto, pagado_en: new Date().toISOString() }));
  return { cuerpo, firma: firmar(cuerpo) };
}

module.exports = { nombre: 'MOCK_QR', CABECERA_FIRMA, crearCobro, imagenQr, verificarCallback, simularCallback };
