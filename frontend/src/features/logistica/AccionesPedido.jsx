import { useState } from 'react';
import { api } from '../../api/client.js';
import { Boton, Campo, ErrorApi, claseInput } from '../../components/ui.jsx';
import { hoyIso } from '../../utils/formato.js';

const PROGRAMABLES = ['EN_PRODUCCION', 'EN_RUTA', 'REVISION_STOCK'];

/**
 * Acciones sobre un pedido según el rol: avanzar (Admin, Taller), retroceder con motivo (Admin),
 * programar la instalación (Admin, Taller) y reintentar la producción de un pedido sin madera (Admin).
 * Se monta de nuevo en cada cambio de etapa, así los campos quedan limpios.
 */
export default function AccionesPedido({ pedido, rol, onHecho }) {
  const [observacion, setObservacion] = useState('');
  const [motivo, setMotivo] = useState('');
  const [fecha, setFecha] = useState(pedido.fecha_instalacion ?? '');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  const esAdmin = rol === 'ADMIN';
  const puedeOperar = esAdmin || rol === 'TALLER';
  // La etapa que se ve ahora: si alguien movió el pedido entretanto, la API rechaza la acción en vez de saltar dos pasos.
  const desde = pedido.fase && { estado: pedido.estado, fase: pedido.fase.orden };
  const ruta = `/logistica/pedidos/${pedido.codigo}`;

  async function ejecutar(sufijo, method, body, mensaje) {
    setError(null);
    setEnviando(true);
    try {
      await api(`${ruta}/${sufijo}`, { method, body });
      onHecho(mensaje);
    } catch (err) {
      setError(err);
      setEnviando(false);
    }
  }

  if (!puedeOperar) {
    return <p className="text-sm text-stone-600">Tu rol puede consultar los pedidos, pero no cambiar su etapa.</p>;
  }

  return (
    <div className="space-y-5">
      <ErrorApi error={error} />

      {pedido.siguiente && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            ejecutar('avanzar', 'POST', { desde, ...(observacion.trim() && { observacion: observacion.trim() }) }, `Pedido movido a: ${pedido.siguiente.descripcion}.`);
          }}
        >
          <Campo etiqueta="Observación (opcional)" ayuda="Queda en el historial junto con la hora exacta y tu nombre.">
            <input type="text" maxLength={500} value={observacion} onChange={(e) => setObservacion(e.target.value)} className={claseInput} />
          </Campo>
          <Boton type="submit" variante="exito" disabled={enviando} className="w-full">
            Avanzar a: {pedido.siguiente.descripcion}
          </Boton>
        </form>
      )}

      {esAdmin && pedido.anterior && (
        <form
          className="space-y-2 border-t border-stone-200 pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            ejecutar('retroceder', 'POST', { desde, motivo: motivo.trim() }, `Pedido devuelto a: ${pedido.anterior.descripcion}.`);
          }}
        >
          <Campo etiqueta="Motivo para retroceder" ayuda="Obligatorio. Solo el Admin puede retroceder un pedido, y de a un paso.">
            <textarea required minLength={5} maxLength={500} rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} className={claseInput} />
          </Campo>
          <Boton type="submit" variante="secundario" disabled={enviando || motivo.trim().length < 5} className="w-full">
            Retroceder a: {pedido.anterior.descripcion}
          </Boton>
        </form>
      )}

      {PROGRAMABLES.includes(pedido.estado) && (
        <form
          className="space-y-2 border-t border-stone-200 pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            ejecutar('instalacion', 'PATCH', { fecha_instalacion: fecha || null }, fecha ? 'Fecha de instalación guardada.' : 'Se quitó la fecha de instalación.');
          }}
        >
          <Campo etiqueta="Fecha de instalación" ayuda="Ordena el calendario logístico. Déjala vacía para quitarla.">
            <input type="date" min={hoyIso()} value={fecha} onChange={(e) => setFecha(e.target.value)} className={claseInput} />
          </Campo>
          <Boton type="submit" variante="secundario" disabled={enviando || fecha === (pedido.fecha_instalacion ?? '')} className="w-full">
            Guardar fecha
          </Boton>
        </form>
      )}

      {esAdmin && pedido.estado === 'REVISION_STOCK' && (
        <div className="space-y-2 border-t border-stone-200 pt-4">
          <p className="text-sm text-stone-700">
            El anticipo ya está cubierto, pero faltaba madera. Cuando repongas el stock en Inventario, inicia la producción:
          </p>
          <Boton
            variante="exito"
            disabled={enviando}
            className="w-full"
            onClick={() => ejecutar('reintentar-produccion', 'POST', undefined, 'Madera descontada: el pedido entró a la fase 1.')}
          >
            Iniciar producción
          </Boton>
        </div>
      )}
    </div>
  );
}
