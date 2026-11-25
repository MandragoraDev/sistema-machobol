import { useState } from 'react';
import { api } from '../../api/client.js';
import { Boton, Campo, ErrorApi, claseInput } from '../../components/ui.jsx';
import { aFechaHoraLocal, formatearBs } from '../../utils/formato.js';

/**
 * Acciones de la venta, antes de la producción: agendar la reunión con el cliente (Admin y Ventas), registrar el
 * precio acordado e iniciar la producción cuando el anticipo está cubierto (Admin).
 */
export default function AccionesVenta({ pedido, rol, onHecho }) {
  const esAdmin = rol === 'ADMIN';
  const ruta = `/ventas/pedidos/${pedido.codigo}`;
  const [fecha, setFecha] = useState(pedido.reunion.fecha ? aFechaHoraLocal(pedido.reunion.fecha) : '');
  const [precio, setPrecio] = useState(pedido.total_final);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  async function ejecutar(sufijo, method, body, mensaje) {
    setError(null);
    setEnviando(true);
    try {
      const respuesta = await api(`${ruta}/${sufijo}`, { method, body });
      // Iniciar producción puede terminar en "revisión de stock" (falta madera): se muestra como advertencia.
      const sinMadera = respuesta?.resultado === 'REVISION_STOCK';
      onHecho(respuesta?.mensaje ?? mensaje, sinMadera ? 'error' : 'exito');
    } catch (err) {
      setError(err);
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-5">
      <ErrorApi error={error} />

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          ejecutar('reunion', 'PATCH', { fecha_reunion: new Date(fecha).toISOString() }, 'Reunión agendada: el cliente recibió la fecha por WhatsApp.');
        }}
      >
        <Campo
          etiqueta="Reunión con el cliente"
          ayuda={pedido.reunion.preferencia ? `El cliente prefiere: «${pedido.reunion.preferencia}».` : 'El cliente recibe la fecha y la hora por WhatsApp.'}
        >
          <input type="datetime-local" required value={fecha} onChange={(e) => setFecha(e.target.value)} className={claseInput} />
        </Campo>
        <Boton type="submit" variante="secundario" disabled={enviando || !fecha} className="w-full">
          {pedido.reunion.fecha ? 'Cambiar la fecha de la reunión' : 'Agendar reunión'}
        </Boton>
      </form>

      {esAdmin && (
        <form
          className="space-y-2 border-t border-stone-200 pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            ejecutar('precio', 'PATCH', { total_final: Number(precio), motivo: motivo.trim() }, `Precio acordado: ${formatearBs(precio)} Bs.`);
          }}
        >
          <Campo etiqueta="Precio final acordado (Bs)" ayuda={`Precio referencial de la cotización: ${formatearBs(pedido.total_exacto)} Bs.`}>
            <input type="number" required min="0.01" step="0.01" value={precio} onChange={(e) => setPrecio(e.target.value)} className={claseInput} />
          </Campo>
          <Campo etiqueta="Motivo del cambio" ayuda="Queda en el historial, junto con el precio anterior.">
            <input type="text" required minLength={5} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} className={claseInput} />
          </Campo>
          <Boton type="submit" variante="secundario" disabled={enviando || motivo.trim().length < 5 || Number(precio) === Number(pedido.total_final)} className="w-full">
            Guardar precio acordado
          </Boton>
        </form>
      )}

      {esAdmin && (
        <div className="space-y-2 border-t border-stone-200 pt-4">
          <p className="text-sm text-stone-700">
            {pedido.cuenta.anticipo_cubierto
              ? 'El anticipo está cubierto: al iniciar la producción se descuenta la madera y el pedido entra a la fase 1.'
              : `La producción se inicia con el anticipo del ${pedido.cuenta.anticipo_pct} % registrado en Pagos.`}
          </p>
          <Boton
            variante="exito"
            disabled={enviando || !pedido.cuenta.anticipo_cubierto}
            className="w-full"
            onClick={() => ejecutar('iniciar-produccion', 'POST', undefined, 'Producción iniciada.')}
          >
            Iniciar producción
          </Boton>
        </div>
      )}
    </div>
  );
}
