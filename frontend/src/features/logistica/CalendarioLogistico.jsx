import { useState } from 'react';
import { claseControl } from '../../components/ui.jsx';
import { formatearDia, formatearFechaHora, haceDias } from '../../utils/formato.js';
import EstadoPedido from './EstadoPedido.jsx';
import { describirPorton } from './porton.js';

const FILTROS = [
  { valor: '', texto: 'Todos los estados' },
  { valor: 'EN_PRODUCCION', texto: 'En producción' },
  { valor: 'EN_RUTA', texto: 'En ruta / instalación' },
  { valor: 'ENTREGADO', texto: 'Entregados / instalados' },
  { valor: 'REVISION_STOCK', texto: 'Esperan madera' },
];

/** Calendario logístico en tabla: primero las instalaciones programadas, por fecha; luego las que no tienen fecha. */
export default function CalendarioLogistico({ pedidos, seleccionado, onSeleccionar }) {
  const [filtro, setFiltro] = useState('');
  const filas = filtro ? pedidos.filter((p) => p.estado === filtro) : pedidos;

  return (
    <div className="rounded-lg border border-primary/15 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-primary">Instalaciones y etapas</h2>
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className={claseControl} aria-label="Filtrar por estado">
          {FILTROS.map((f) => <option key={f.valor} value={f.valor}>{f.texto}</option>)}
        </select>
      </div>
      {filas.length === 0 ? (
        <p className="text-sm text-stone-600">No hay pedidos con este filtro.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="py-2 pr-4 font-medium">Instalación</th>
                <th className="py-2 pr-4 font-medium">Pedido</th>
                <th className="py-2 pr-4 font-medium">Cliente</th>
                <th className="py-2 pr-4 font-medium">Portón</th>
                <th className="py-2 pr-4 font-medium">Etapa</th>
                <th className="py-2 pr-4 font-medium">En la etapa</th>
                <th className="py-2 font-medium">Pagado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {filas.map((p) => (
                <tr key={p.codigo} className={seleccionado === p.codigo ? 'bg-surface' : ''}>
                  <td className="whitespace-nowrap py-3 pr-4 font-medium">
                    {p.fecha_instalacion ? formatearDia(p.fecha_instalacion) : <span className="text-stone-400">Sin programar</span>}
                  </td>
                  <td className="whitespace-nowrap py-3 pr-4">
                    <button type="button" onClick={() => onSeleccionar(p.codigo)} className="font-medium text-primary underline-offset-2 hover:underline">
                      {p.codigo}
                    </button>
                  </td>
                  <td className="min-w-36 py-3 pr-4">{p.cliente.nombre || `+${p.cliente.wa_id}`}</td>
                  <td className="min-w-44 py-3 pr-4 text-stone-600">{describirPorton(p.porton)}</td>
                  <td className="py-3 pr-4">
                    <EstadoPedido estado={p.estado} nombre={p.estado_nombre} />
                    {p.fase && p.estado === 'EN_PRODUCCION' && <span className="ml-2 text-xs text-stone-600">Fase {p.fase.orden}: {p.fase.nombre}</span>}
                  </td>
                  <td className="whitespace-nowrap py-3 pr-4 text-stone-600">{p.en_etapa_desde ? haceDias(p.en_etapa_desde) : '—'}</td>
                  <td className="whitespace-nowrap py-3 text-stone-600">{p.pagado_en ? formatearFechaHora(p.pagado_en) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
