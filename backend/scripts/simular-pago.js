/**
 * Simula que el cliente pagó (o que el banco rechazó) el QR vigente de un pedido. La API recibe el callback
 * firmado de la pasarela simulada y ejecuta la misma transacción ACID que con un pago real.
 *
 *   npm run pagos:simular -- MCH-2026-0001            pago exitoso
 *   npm run pagos:simular -- MCH-2026-0001 --fallido  pago rechazado
 */
const { parseArgs } = require('node:util');
const env = require('../src/config/env');
const { pool, query } = require('../src/config/db');

/** Busca el QR vigente del pedido (por código) o del último pedido del cliente (por wa_id) y lo "paga". */
async function simularPago({ codigo, waId, estado = 'PAGADO' }) {
  const { rows: [pago] } = await query(
    `SELECT q.id, q.monto, p.codigo
     FROM pagos_qr q
     JOIN pedidos p ON p.id = q.pedido_id
     JOIN clientes c ON c.id = p.cliente_id
     WHERE q.estado = 'PENDIENTE' AND q.expira_en > now() AND ${codigo ? 'p.codigo = $1' : 'c.wa_id = $1'}
     ORDER BY q.id DESC
     LIMIT 1`,
    [codigo ?? waId],
  );
  if (!pago) {
    return { error: `No hay un QR de pago vigente para ${codigo ?? `el cliente ${waId}`}.` };
  }
  const respuesta = await fetch(`http://localhost:${env.port}/api/dev/pagos/${pago.id}/simular`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Service-Token': env.serviceToken },
    body: JSON.stringify({ estado }),
  });
  return { pedido: pago.codigo, monto: pago.monto, ...(await respuesta.json()) };
}

if (require.main === module) {
  const { values, positionals: [codigo] } = parseArgs({ allowPositionals: true, options: { fallido: { type: 'boolean', default: false } } });
  if (!codigo) {
    console.error('Uso: npm run pagos:simular -- MCH-AAAA-NNNN [--fallido]');
    process.exit(1);
  }
  simularPago({ codigo: codigo.toUpperCase(), estado: values.fallido ? 'FALLIDO' : 'PAGADO' })
    .then((resultado) => console.log(resultado))
    .catch((err) => {
      console.error(err.cause?.code === 'ECONNREFUSED' ? 'La API no responde. ¿Está levantada (npm run dev)?' : err);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

module.exports = { simularPago };
