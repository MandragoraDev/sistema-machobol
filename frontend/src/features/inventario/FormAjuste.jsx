import { useState } from 'react';
import { api } from '../../api/client.js';
import { Alerta, Boton, Campo, ErrorApi, claseInput } from '../../components/ui.jsx';
import { formatearDeltaM2, formatearM2, nombreMadera } from '../../utils/formato.js';
import { leerNumero } from '../../utils/numeros.js';

const SENTIDOS = [
  { valor: 'restar', texto: 'Restar' },
  { valor: 'sumar', texto: 'Sumar' },
];

/** Ajuste manual del stock (solo Admin), con motivo obligatorio. */
export default function FormAjuste({ maderas, onRegistrado }) {
  const [maderaId, setMaderaId] = useState('');
  const [sentido, setSentido] = useState('restar');
  const [cantidad, setCantidad] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState(null);
  const [exito, setExito] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const madera = maderas.find((m) => String(m.id) === maderaId);
  const valor = leerNumero(cantidad, { min: 0.0001, max: 99_999_999, decimales: 4 });
  const delta = valor === null ? null : sentido === 'sumar' ? valor : -valor;
  const resultante = madera && delta !== null ? Number(madera.stock_actual_m2) + delta : null;
  const quedaNegativo = resultante !== null && resultante < 0;
  const valido = Boolean(madera && delta && !quedaNegativo && motivo.trim().length >= 5);

  async function enviar(evento) {
    evento.preventDefault();
    setError(null);
    setExito(null);
    setEnviando(true);
    try {
      const { movimiento, stock_actual_m2 } = await api('/inventario/ajustes', {
        method: 'POST',
        body: { madera_id: madera.id, cantidad_m2: delta, motivo: motivo.trim() },
      });
      setExito(`Ajuste registrado: ${formatearDeltaM2(movimiento.cantidad_m2)}. Stock actual: ${formatearM2(stock_actual_m2)}.`);
      setCantidad('');
      setMotivo('');
      onRegistrado();
    } catch (err) {
      setError(err);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <Campo etiqueta="Madera">
        <select required value={maderaId} onChange={(e) => setMaderaId(e.target.value)} className={claseInput}>
          <option value="">Selecciona la madera…</option>
          {maderas.map((m) => (
            <option key={m.id} value={m.id}>
              {nombreMadera(m)} · {formatearM2(m.stock_actual_m2)}
            </option>
          ))}
        </select>
      </Campo>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <span id="ajuste-operacion" className="mb-1 block text-sm font-medium text-stone-700">Operación</span>
          <div role="group" aria-labelledby="ajuste-operacion" className="flex rounded-md border border-stone-300 p-0.5">
            {SENTIDOS.map((s) => (
              <button
                key={s.valor}
                type="button"
                onClick={() => setSentido(s.valor)}
                aria-pressed={sentido === s.valor}
                className={`flex-1 rounded px-2 py-1.5 text-sm ${sentido === s.valor ? 'bg-primary text-surface' : 'text-stone-700'}`}
              >
                {s.texto}
              </button>
            ))}
          </div>
        </div>
        <Campo etiqueta="Cantidad (m²)">
          <input type="number" inputMode="decimal" min="0.0001" step="0.0001" required
            value={cantidad} onChange={(e) => setCantidad(e.target.value)} className={claseInput} />
        </Campo>
      </div>

      {resultante !== null && (
        <p className={`text-sm ${quedaNegativo ? 'text-red-700' : 'text-stone-700'}`}>
          Stock: {formatearM2(madera.stock_actual_m2)} → <strong>{formatearM2(resultante)}</strong>
          {quedaNegativo && ' · el stock no puede quedar en negativo'}
        </p>
      )}

      <Campo etiqueta="Motivo" ayuda="Obligatorio: conteo físico, merma, daño, corrección…">
        <textarea required minLength={5} maxLength={500} rows={2}
          value={motivo} onChange={(e) => setMotivo(e.target.value)} className={claseInput} />
      </Campo>

      <ErrorApi error={error} />
      {exito && <Alerta tipo="exito">{exito}</Alerta>}

      <Boton type="submit" disabled={!valido || enviando} className="w-full">
        {enviando ? 'Registrando…' : 'Registrar ajuste'}
      </Boton>
    </form>
  );
}
