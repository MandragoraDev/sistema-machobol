import { useState } from 'react';
import { api } from '../../api/client.js';
import { Boton, Campo, ErrorApi, Tarjeta, claseInput } from '../../components/ui.jsx';
import { nombreMadera } from '../../utils/formato.js';

/** Alta o edición de un tipo de madera (solo Admin). El stock no se edita aquí. */
export default function FormMadera({ madera, onGuardado, onCancelar }) {
  const editando = Boolean(madera);
  const [form, setForm] = useState({
    especie: madera?.especie ?? '',
    espesor_pulg: madera ? String(Number(madera.espesor_pulg)) : '',
    stock_minimo_m2: madera ? String(Number(madera.stock_minimo_m2)) : '0',
    activo: madera?.activo ?? true,
  });
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const cambiar = (campo) => (evento) => setForm((actual) => ({ ...actual, [campo]: evento.target.value }));

  async function enviar(evento) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    const body = {
      especie: form.especie.trim(),
      espesor_pulg: Number(form.espesor_pulg),
      stock_minimo_m2: Number(form.stock_minimo_m2),
      ...(editando && { activo: form.activo }),
    };
    try {
      await api(editando ? `/inventario/${madera.id}` : '/inventario', { method: editando ? 'PATCH' : 'POST', body });
      onGuardado();
    } catch (err) {
      setError(err);
      setEnviando(false);
    }
  }

  return (
    <Tarjeta titulo={editando ? `Editar ${nombreMadera(madera)}` : 'Nueva madera'}>
      <form onSubmit={enviar} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo etiqueta="Especie">
            <input type="text" required minLength={2} maxLength={80}
              value={form.especie} onChange={cambiar('especie')} className={claseInput} />
          </Campo>
          <Campo etiqueta="Espesor (pulg)" ayuda="Solo clasifica la madera; no entra en el cálculo de m².">
            <input type="number" inputMode="decimal" required min="0.01" max="999.99" step="0.01"
              value={form.espesor_pulg} onChange={cambiar('espesor_pulg')} className={claseInput} />
          </Campo>
          <Campo etiqueta="Stock mínimo (m²)" ayuda="Por debajo de este valor aparece una alerta.">
            <input type="number" inputMode="decimal" required min="0" step="0.0001"
              value={form.stock_minimo_m2} onChange={cambiar('stock_minimo_m2')} className={claseInput} />
          </Campo>
        </div>

        {editando && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.activo}
              onChange={(e) => setForm((actual) => ({ ...actual, activo: e.target.checked }))} />
            Madera activa (admite ingresos y aparece en los formularios)
          </label>
        )}

        <ErrorApi error={error} />

        <div className="flex gap-2">
          <Boton type="submit" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar'}</Boton>
          <Boton variante="secundario" onClick={onCancelar}>Cancelar</Boton>
        </div>
      </form>
    </Tarjeta>
  );
}
