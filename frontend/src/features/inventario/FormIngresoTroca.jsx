import { useState } from 'react';
import { api } from '../../api/client.js';
import { Alerta, Boton, Campo, ErrorApi, claseInput } from '../../components/ui.jsx';
import { formatearDeltaM2, formatearM2, formatearNumero, nombreMadera } from '../../utils/formato.js';
import { leerNumero } from '../../utils/numeros.js';
import { METROS_POR_PIE, METROS_POR_PULGADA, trocaAM2 } from './conversion.js';

const VACIO = { piezas: '', ancho_pulg: '', largo_pies: '', observacion: '' };

function VistaPrevia({ piezas, ancho, largo, m2, madera }) {
  if (!m2) {
    return <p className="text-sm text-stone-500">Ingresa piezas, ancho y largo para ver la conversión a m².</p>;
  }
  return (
    <>
      <p className="text-2xl font-semibold text-primary">{formatearM2(m2)}</p>
      <p className="mt-1 text-xs text-stone-600">
        {piezas} {piezas === 1 ? 'pieza' : 'piezas'} × {formatearNumero(ancho)}″ ({formatearNumero(ancho * METROS_POR_PULGADA)} m)
        {' × '}
        {formatearNumero(largo)}′ ({formatearNumero(largo * METROS_POR_PIE)} m)
      </p>
      {madera && (
        <p className="mt-2 text-sm">
          Stock de {nombreMadera(madera)}: {formatearM2(madera.stock_actual_m2)} →{' '}
          <strong>{formatearM2(Number(madera.stock_actual_m2) + Number(m2))}</strong>
        </p>
      )}
    </>
  );
}

/** Registro de una troca: las medidas llegan en pulgadas × pies y se muestran convertidas a m² en vivo. */
export default function FormIngresoTroca({ maderas, onRegistrado }) {
  const [maderaId, setMaderaId] = useState('');
  const [form, setForm] = useState(VACIO);
  const [error, setError] = useState(null);
  const [exito, setExito] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const madera = maderas.find((m) => String(m.id) === maderaId);
  const piezas = leerNumero(form.piezas, { min: 1, max: 10_000 });
  const ancho = leerNumero(form.ancho_pulg, { min: 0.01, max: 100, decimales: 2 });
  const largo = leerNumero(form.largo_pies, { min: 0.01, max: 100, decimales: 2 });
  const m2 = piezas && ancho && largo ? trocaAM2(piezas, ancho, largo) : null;
  const valido = Boolean(madera && m2 && Number(m2) > 0);

  const cambiar = (campo) => (evento) => {
    setForm((actual) => ({ ...actual, [campo]: evento.target.value }));
    setExito(null);
  };

  async function enviar(evento) {
    evento.preventDefault();
    setError(null);
    setExito(null);
    setEnviando(true);
    try {
      const { movimiento, stock_actual_m2 } = await api('/inventario/ingresos', {
        method: 'POST',
        body: {
          madera_id: madera.id,
          piezas,
          ancho_pulg: ancho,
          largo_pies: largo,
          observacion: form.observacion.trim() || undefined,
        },
      });
      setExito(
        `Ingreso registrado: ${formatearDeltaM2(movimiento.cantidad_m2)} de ${nombreMadera(madera)}. Stock actual: ${formatearM2(stock_actual_m2)}.`,
      );
      setForm(VACIO);
      onRegistrado();
    } catch (err) {
      setError(err);
    } finally {
      setEnviando(false);
    }
  }

  if (maderas.length === 0) {
    return <p className="text-sm text-stone-600">No hay maderas activas. El Administrador debe registrar una primero.</p>;
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <Campo etiqueta="Madera">
        <select required value={maderaId} onChange={(e) => setMaderaId(e.target.value)} className={claseInput}>
          <option value="">Selecciona la madera…</option>
          {maderas.map((m) => (
            <option key={m.id} value={m.id}>
              {nombreMadera(m)}
            </option>
          ))}
        </select>
      </Campo>

      <div className="grid grid-cols-3 gap-3">
        <Campo etiqueta="Piezas">
          <input type="number" inputMode="numeric" min="1" max="10000" step="1" required
            value={form.piezas} onChange={cambiar('piezas')} className={claseInput} />
        </Campo>
        <Campo etiqueta="Ancho (pulg)">
          <input type="number" inputMode="decimal" min="0.01" max="100" step="0.01" required
            value={form.ancho_pulg} onChange={cambiar('ancho_pulg')} className={claseInput} />
        </Campo>
        <Campo etiqueta="Largo (pies)">
          <input type="number" inputMode="decimal" min="0.01" max="100" step="0.01" required
            value={form.largo_pies} onChange={cambiar('largo_pies')} className={claseInput} />
        </Campo>
      </div>

      <div className="rounded-md border border-primary/15 bg-surface p-4" aria-live="polite">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-stone-500">Equivale a</p>
        <VistaPrevia piezas={piezas} ancho={ancho} largo={largo} m2={m2} madera={madera} />
      </div>

      <Campo etiqueta="Observación (opcional)" ayuda="Proveedor, número de troca, etc.">
        <input type="text" maxLength={500} value={form.observacion} onChange={cambiar('observacion')} className={claseInput} />
      </Campo>

      <ErrorApi error={error} />
      {exito && <Alerta tipo="exito">{exito}</Alerta>}

      <Boton type="submit" variante="exito" disabled={!valido || enviando} className="w-full">
        {enviando ? 'Registrando…' : 'Registrar ingreso'}
      </Boton>
    </form>
  );
}
