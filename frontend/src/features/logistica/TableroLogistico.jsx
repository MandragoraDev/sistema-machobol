import { formatearDia, haceDias } from '../../utils/formato.js';
import ProgresoFases from './ProgresoFases.jsx';
import { describirPorton } from './porton.js';

// Tablero Kanban simple: una columna por estado operativo. Las fases (1 a 11) se ven dentro de cada tarjeta.
const COLUMNAS = [
  { estado: 'REVISION_STOCK', titulo: 'Esperan madera', ayuda: 'Pagados sin stock suficiente', soloSiHay: true },
  { estado: 'EN_PRODUCCION', titulo: 'En producción', ayuda: 'Fases 1 a 10, en el taller' },
  { estado: 'EN_RUTA', titulo: 'En ruta / instalación', ayuda: 'Fase 11' },
  { estado: 'ENTREGADO', titulo: 'Entregados / instalados', ayuda: 'Últimos 30 días' },
];

function Tarjeta({ pedido, seleccionado, onSeleccionar }) {
  return (
    <button
      type="button"
      onClick={() => onSeleccionar(pedido.codigo)}
      aria-pressed={seleccionado}
      className={`w-full rounded-md border bg-white p-3 text-left shadow-sm transition hover:border-primary/50 ${
        seleccionado ? 'border-primary ring-2 ring-primary/20' : 'border-stone-200'
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold text-primary">{pedido.codigo}</span>
        {pedido.fecha_instalacion && (
          <span className="whitespace-nowrap text-xs font-medium text-accent">Instala {formatearDia(pedido.fecha_instalacion)}</span>
        )}
      </div>
      <p className="mt-1 text-sm text-stone-800">{pedido.cliente.nombre || `+${pedido.cliente.wa_id}`}</p>
      <p className="text-xs text-stone-600">{describirPorton(pedido.porton)}</p>
      <div className="mt-3">
        <ProgresoFases estado={pedido.estado} fase={pedido.fase} />
      </div>
      {pedido.en_etapa_desde && <p className="mt-1 text-xs text-stone-500">En esta etapa desde {haceDias(pedido.en_etapa_desde)}</p>}
    </button>
  );
}

export default function TableroLogistico({ pedidos, seleccionado, onSeleccionar }) {
  const columnas = COLUMNAS.filter((c) => !c.soloSiHay || pedidos.some((p) => p.estado === c.estado));
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {columnas.map((columna) => {
        const enColumna = pedidos.filter((p) => p.estado === columna.estado);
        // Las columnas se reparten el ancho disponible (mínimo 18rem; en pantallas angostas, desplazamiento horizontal).
        return (
          <section key={columna.estado} className="flex min-w-72 flex-1 flex-col rounded-lg bg-stone-100 p-3" aria-label={columna.titulo}>
            <header className="mb-3">
              <h2 className="flex items-center justify-between text-sm font-semibold text-primary">
                {columna.titulo}
                <span className="rounded-full bg-white px-2 py-0.5 text-xs text-stone-600">{enColumna.length}</span>
              </h2>
              <p className="text-xs text-stone-500">{columna.ayuda}</p>
            </header>
            {/* En columnas anchas, las tarjetas se acomodan en cuadrícula en vez de estirarse. */}
            <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] content-start gap-2">
              {enColumna.length === 0 ? (
                <p className="col-span-full rounded-md border border-dashed border-stone-300 p-3 text-center text-xs text-stone-500">Sin pedidos</p>
              ) : (
                enColumna.map((pedido) => (
                  <Tarjeta key={pedido.codigo} pedido={pedido} seleccionado={seleccionado === pedido.codigo} onSeleccionar={onSeleccionar} />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
