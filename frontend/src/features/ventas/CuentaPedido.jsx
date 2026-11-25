import { useState } from 'react';
import { api } from '../../api/client.js';
import { Boton, Campo, ErrorApi, claseInput } from '../../components/ui.jsx';
import { formatearBs, formatearFechaHora } from '../../utils/formato.js';

const METODOS = [
  { valor: 'QR', texto: 'QR' },
  { valor: 'EFECTIVO', texto: 'Efectivo' },
  { valor: 'TRANSFERENCIA', texto: 'Transferencia' },
  { valor: 'CHEQUE', texto: 'Cheque' },
];
const NOMBRE_METODO = Object.fromEntries(METODOS.map((m) => [m.valor, m.texto]));

// Los montos llegan como texto exacto ("10868.00"); en centavos se restan sin errores de redondeo.
const centavos = (texto) => Math.round(Number(texto) * 100);
const aMonto = (cent) => (cent / 100).toFixed(2);

/**
 * Cuenta del pedido: precio acordado, lo pagado, el saldo y el anticipo que exige la producción.
 * El Admin registra los pagos que recibe (QR del negocio, efectivo, transferencia o cheque) y puede anularlos con un motivo.
 */
export default function CuentaPedido({ pedido, rol, onHecho }) {
  const { cuenta } = pedido;
  const esAdmin = rol === 'ADMIN';
  const cerrado = ['ENTREGADO', 'CANCELADO'].includes(pedido.estado);
  const faltaAnticipo = Math.max(0, centavos(cuenta.anticipo_requerido) - centavos(cuenta.pagado));
  const saldo = centavos(cuenta.saldo);

  const [monto, setMonto] = useState('');
  const [metodo, setMetodo] = useState('QR');
  const [referencia, setReferencia] = useState('');
  const [anulando, setAnulando] = useState(null);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  async function enviar(ruta, body, mensaje) {
    setError(null);
    setEnviando(true);
    try {
      await api(ruta, { method: 'POST', body });
      onHecho(mensaje);
    } catch (err) {
      setError(err);
      setEnviando(false);
    }
  }

  const avance = Math.min(100, cuenta.porcentaje_pagado);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <dl className="grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-stone-500">Precio acordado</dt>
            <dd className="font-medium text-stone-800">{formatearBs(cuenta.precio_acordado)} Bs</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-stone-500">Pagado</dt>
            <dd className="font-medium text-accent">{formatearBs(cuenta.pagado)} Bs</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-stone-500">Saldo</dt>
            <dd className="font-medium text-stone-800">{formatearBs(cuenta.saldo)} Bs</dd>
          </div>
        </dl>
        <div className="h-2 overflow-hidden rounded-full bg-stone-200" role="progressbar" aria-valuenow={avance} aria-valuemin={0} aria-valuemax={100} aria-label="Porcentaje pagado">
          <div className="h-full bg-accent" style={{ width: `${avance}%` }} />
        </div>
        <p className="text-xs text-stone-600">
          {cuenta.porcentaje_pagado} % pagado ·{' '}
          {cuenta.anticipo_cubierto
            ? `anticipo del ${cuenta.anticipo_pct} % cubierto`
            : `faltan ${formatearBs(aMonto(faltaAnticipo))} Bs para el anticipo del ${cuenta.anticipo_pct} % (${formatearBs(cuenta.anticipo_requerido)} Bs)`}
        </p>
      </div>

      <ErrorApi error={error} />

      {cuenta.pagos.length > 0 && (
        <ul className="divide-y divide-stone-200 text-sm">
          {cuenta.pagos.map((p) => (
            <li key={p.id} className="py-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className={p.anulado_en ? 'text-stone-400 line-through' : 'font-medium text-stone-800'}>
                  {formatearBs(p.monto)} Bs · {NOMBRE_METODO[p.metodo]}
                  {p.referencia && <span className="font-normal text-stone-500"> · {p.referencia}</span>}
                </span>
                <span className="text-xs text-stone-500">
                  {formatearFechaHora(p.creado_en)}
                  {p.registrado_por && ` · ${p.registrado_por}`}
                </span>
              </div>
              {p.anulado_en ? (
                <p className="text-xs italic text-red-700">Anulado por {p.anulado_por}: {p.motivo_anulacion}</p>
              ) : (
                esAdmin && !cerrado && (anulando === p.id ? (
                  <form
                    className="mt-2 flex gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      enviar(`/pagos/${p.id}/anular`, { motivo: motivo.trim() }, 'Pago anulado.');
                    }}
                  >
                    <input
                      required
                      minLength={5}
                      maxLength={500}
                      placeholder="Motivo de la anulación"
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      className={claseInput}
                      aria-label="Motivo de la anulación"
                    />
                    <Boton type="submit" variante="secundario" disabled={enviando || motivo.trim().length < 5}>Anular</Boton>
                  </form>
                ) : (
                  <button type="button" onClick={() => { setAnulando(p.id); setMotivo(''); }} className="mt-1 text-xs text-stone-500 hover:text-red-700">
                    Anular este pago
                  </button>
                ))
              )}
            </li>
          ))}
        </ul>
      )}

      {esAdmin && !cerrado && saldo > 0 && (
        <form
          className="space-y-3 rounded-md bg-surface/60 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            enviar('/pagos', {
              pedido: pedido.codigo,
              monto: Number(monto),
              metodo,
              ...(referencia.trim() && { referencia: referencia.trim() }),
            }, `Pago de ${formatearBs(monto)} Bs registrado.`);
          }}
        >
          <p className="text-sm font-medium text-primary">Registrar un pago recibido</p>
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Monto (Bs)">
              <input type="number" required min="0.01" step="0.01" max={aMonto(saldo)} value={monto} onChange={(e) => setMonto(e.target.value)} className={claseInput} />
            </Campo>
            <Campo etiqueta="Método">
              <select value={metodo} onChange={(e) => setMetodo(e.target.value)} className={claseInput}>
                {METODOS.map((m) => <option key={m.valor} value={m.valor}>{m.texto}</option>)}
              </select>
            </Campo>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {faltaAnticipo > 0 && (
              <button type="button" onClick={() => setMonto(aMonto(faltaAnticipo))} className="rounded-full bg-white px-3 py-1 text-primary ring-1 ring-primary/30">
                Lo que falta del anticipo: {formatearBs(aMonto(faltaAnticipo))}
              </button>
            )}
            <button type="button" onClick={() => setMonto(aMonto(saldo))} className="rounded-full bg-white px-3 py-1 text-primary ring-1 ring-primary/30">
              Todo el saldo: {formatearBs(aMonto(saldo))}
            </button>
          </div>
          <Campo etiqueta="Referencia (opcional)" ayuda="N.º de cheque, de transacción o de comprobante.">
            <input type="text" maxLength={80} value={referencia} onChange={(e) => setReferencia(e.target.value)} className={claseInput} />
          </Campo>
          <Boton type="submit" variante="exito" disabled={enviando || !monto} className="w-full">
            Registrar pago
          </Boton>
        </form>
      )}
    </div>
  );
}
