import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { EncabezadoPagina, ErrorApi } from '../../components/ui.jsx';
import TableroLogistico from './TableroLogistico.jsx';
import CalendarioLogistico from './CalendarioLogistico.jsx';
import DetallePedido from './DetallePedido.jsx';

const VISTAS = [
  { valor: 'tablero', texto: 'Tablero' },
  { valor: 'calendario', texto: 'Calendario' },
];

/** Calendario logístico y trazabilidad (R-13): pedidos con anticipo, su etapa y su historial; y las reuniones agendadas. */
export default function LogisticaPage() {
  const [vista, setVista] = useState('tablero');
  const [seleccionado, setSeleccionado] = useState(null);
  const { usuario } = useAuth();
  const tablero = useApi('/logistica/tablero');
  // Las reuniones con clientes las ven quienes venden (el Taller no tiene acceso a Ventas).
  const reuniones = useApi(usuario.rol === 'TALLER' ? null : '/ventas/pedidos', { estado: 'REUNION_AGENDADA' });
  const pedidos = tablero.datos?.pedidos;

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo="Logística y trazabilidad"
        descripcion="Pedidos con el anticipo cubierto: avanzan por las 11 fases del taller, salen en ruta a instalación y quedan entregados. Cada cambio queda registrado con fecha y hora."
        acciones={
          <div className="flex rounded-md border border-stone-300 bg-white p-0.5" role="tablist" aria-label="Vista">
            {VISTAS.map((v) => (
              <button
                key={v.valor}
                type="button"
                role="tab"
                aria-selected={vista === v.valor}
                onClick={() => setVista(v.valor)}
                className={`rounded px-4 py-1.5 text-sm ${vista === v.valor ? 'bg-primary text-surface' : 'text-stone-700'}`}
              >
                {v.texto}
              </button>
            ))}
          </div>
        }
      />

      <ErrorApi error={tablero.error} />

      <div className={`grid items-start gap-6 ${seleccionado ? 'xl:grid-cols-[minmax(0,1fr)_24rem]' : ''}`}>
        <div className="min-w-0">
          {!pedidos ? (
            !tablero.error && <p className="text-sm text-stone-500">Cargando…</p>
          ) : pedidos.length === 0 ? (
            <p className="rounded-lg border border-dashed border-stone-300 bg-white p-6 text-center text-sm text-stone-600">
              Todavía no hay pedidos en producción. Aparecen aquí cuando el Admin inicia la producción, con el anticipo cubierto.
            </p>
          ) : vista === 'tablero' ? (
            <TableroLogistico pedidos={pedidos} seleccionado={seleccionado} onSeleccionar={setSeleccionado} />
          ) : (
            <CalendarioLogistico pedidos={pedidos} reuniones={reuniones.datos ?? []} seleccionado={seleccionado} onSeleccionar={setSeleccionado} />
          )}
        </div>

        {seleccionado && (
          <DetallePedido key={seleccionado} codigo={seleccionado} onCambio={tablero.recargar} onCerrar={() => setSeleccionado(null)} />
        )}
      </div>
    </div>
  );
}
