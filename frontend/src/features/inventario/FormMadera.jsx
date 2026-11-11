import { useState } from 'react';
import { api } from '../../api/client.js';
import { Boton, Campo, ErrorApi, Tarjeta, claseInput } from '../../components/ui.jsx';
import { nombreMadera } from '../../utils/formato.js';

const TIPOS_PORTON = [
  { tipo: 'CORREDIZO', etiqueta: 'Precio portón corredizo (Bs/m²)' },
  { tipo: 'BATIENTE', etiqueta: 'Precio portón batiente (Bs/m²)' },
];

/**
 * Alta o edición de un tipo de madera (solo Admin), con su precio por m² para cada tipo de portón.
 * Sin precio, la madera no se ofrece para ese tipo de portón. El stock no se edita aquí.
 */
export default function FormMadera({ madera, onGuardado, onCancelar }) {
  const editando = Boolean(madera);
  const [form, setForm] = useState({
    especie: madera?.especie ?? '',
    espesor_pulg: madera ? String(Number(madera.espesor_pulg)) : '',
    stock_minimo_m2: madera ? String(Number(madera.stock_minimo_m2)) : '0',
    activo: madera?.activo ?? true,
    ...Object.fromEntries(TIPOS_PORTON.map(({ tipo }) => [tipo, madera?.precios?.[tipo] ? String(Number(madera.precios[tipo])) : ''])),
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
    // Vacío = sin precio (la madera no se ofrece para ese tipo de portón). Un valor inválido lo rechaza la API.
    const precios = Object.fromEntries(
      TIPOS_PORTON.map(({ tipo }) => [tipo, form[tipo].trim() === '' ? null : Number(form[tipo])]),
    );
    try {
      const guardada = await api(editando ? `/inventario/${madera.id}` : '/inventario', { method: editando ? 'PATCH' : 'POST', body });
      await api(`/catalogo/precios/${guardada.id}`, { method: 'PUT', body: precios });
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

        <div className="grid gap-3 sm:grid-cols-2">
          {TIPOS_PORTON.map(({ tipo, etiqueta }) => (
            <Campo key={tipo} etiqueta={etiqueta} ayuda="Déjalo vacío si esta madera no se ofrece para este portón.">
              <input type="number" inputMode="decimal" min="0.01" step="0.01"
                value={form[tipo]} onChange={cambiar(tipo)} className={claseInput} />
            </Campo>
          ))}
        </div>

        {editando && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.activo}
              onChange={(e) => setForm((actual) => ({ ...actual, activo: e.target.checked }))} />
            Madera activa (admite ingresos, aparece en los formularios y se ofrece a los clientes)
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
