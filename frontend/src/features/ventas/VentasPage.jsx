import { useState } from 'react';
import { useApi } from '../../hooks/useApi.js';
import { EncabezadoPagina, ErrorApi, claseControl } from '../../components/ui.jsx';
import { formatearBs, formatearFechaHora } from '../../utils/formato.js';
import DetallePedido from '../logistica/DetallePedido.jsx';
import EstadoPedido from '../logistica/EstadoPedido.jsx';
import { describirPorton } from '../logistica/porton.js';

const FILTROS = [
  { valor: '', texto: 'Todas las etapas de venta' },
  { valor: 'REUNION_SOLICITADA', texto: 'Reunión por agendar' },
  { valor: 'REUNION_AGENDADA', texto: 'Reunión agendada' },
  { valor: 'COTIZADO', texto: 'Solo cotizados' },
  { valor: 'REVISION_STOCK', texto: 'Con anticipo, sin madera' },
];

function Reunion({ reunion }) {
  if (reunion.fecha) return <span className="whitespace-nowrap">{formatearFechaHora(reunion.fecha)}</span>;
  if (reunion.preferencia) return <span className="text-amber-800">Prefiere: {reunion.preferencia}</span>;
  return <span className="text-stone-400">—</span>;
}

/**
 * Ventas: cotizaciones y reuniones con los clientes, antes de la producción. Primero las reuniones por agendar.
 * En la ficha se agenda la reunión, se registra el precio acordado y los pagos, y se inicia la producción.
 */
export default function VentasPage() {
  const [filtro, setFiltro] = useState('');
  const [seleccionado, setSeleccionado] = useState(null);
  const lista = useApi('/ventas/pedidos', { estado: filtro || undefined });
  const pedidos = lista.datos;

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        titulo="Ventas"
        descripcion="Cotizaciones y reuniones con los clientes. El bot nunca cobra: el precio final y los pagos se acuerdan en la reunión, y la producción empieza con el anticipo."
        acciones={
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className={claseControl} aria-label="Filtrar por etapa">
            {FILTROS.map((f) => <option key={f.valor} value={f.valor}>{f.texto}</option>)}
          </select>
        }
      />

      <ErrorApi error={lista.error} />

      <div className={`grid items-start gap-6 ${seleccionado ? 'xl:grid-cols-[minmax(0,1fr)_26rem]' : ''}`}>
        <div className="min-w-0 rounded-lg border border-primary/15 bg-white p-5 shadow-sm">
          {!pedidos ? (
            !lista.error && <p className="text-sm text-stone-500">Cargando…</p>
          ) : pedidos.length === 0 ? (
            <p className="text-sm text-stone-600">No hay pedidos en esta etapa.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
                  <tr>
                    <th className="py-2 pr-4 font-medium">Pedido</th>
                    <th className="py-2 pr-4 font-medium">Cliente</th>
                    <th className="py-2 pr-4 font-medium">Portón</th>
                    <th className="py-2 pr-4 font-medium">Etapa</th>
                    <th className="py-2 pr-4 font-medium">Reunión</th>
                    <th className="py-2 pr-4 text-right font-medium">Precio (Bs)</th>
                    <th className="py-2 text-right font-medium">Pagado (Bs)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200">
                  {pedidos.map((p) => (
                    <tr key={p.codigo} className={seleccionado === p.codigo ? 'bg-surface' : ''}>
                      <td className="whitespace-nowrap py-3 pr-4">
                        <button type="button" onClick={() => setSeleccionado(p.codigo)} className="font-medium text-primary underline-offset-2 hover:underline">
                          {p.codigo}
                        </button>
                      </td>
                      <td className="min-w-36 py-3 pr-4">
                        {p.cliente.nombre || 'Sin nombre'}
                        <span className="block text-xs text-stone-500">+{p.cliente.wa_id}</span>
                      </td>
                      <td className="min-w-44 py-3 pr-4 text-stone-600">
                        {describirPorton(p.porton)}
                        {p.fuera_ciudad && <span className="block text-xs">Fuera de la ciudad</span>}
                      </td>
                      <td className="py-3 pr-4"><EstadoPedido estado={p.estado} nombre={p.estado_nombre} /></td>
                      <td className="min-w-40 py-3 pr-4 text-stone-700"><Reunion reunion={p.reunion} /></td>
                      <td className="whitespace-nowrap py-3 pr-4 text-right tabular-nums">
                        {formatearBs(p.precio_acordado)}
                        {p.precio_acordado !== p.total_referencial && (
                          <span className="block text-xs text-stone-500">Cotizado: {formatearBs(p.total_referencial)}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap py-3 text-right tabular-nums text-stone-700">{formatearBs(p.pagado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {seleccionado && (
          <DetallePedido key={seleccionado} codigo={seleccionado} onCambio={lista.recargar} onCerrar={() => setSeleccionado(null)} />
        )}
      </div>
    </div>
  );
}
