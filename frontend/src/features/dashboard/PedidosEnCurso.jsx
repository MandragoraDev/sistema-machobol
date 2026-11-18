import { Link } from 'react-router';
import { useApi } from '../../hooks/useApi.js';
import { Tarjeta } from '../../components/ui.jsx';
import { formatearDia, hoyIso } from '../../utils/formato.js';

const CONTADORES = [
  { estado: 'EN_PRODUCCION', texto: 'En producción' },
  { estado: 'EN_RUTA', texto: 'En ruta / instalación' },
  { estado: 'REVISION_STOCK', texto: 'Esperan madera' },
];

/** Resumen del tablero logístico para el Dashboard: cuántos pedidos hay en cada etapa y la próxima instalación. */
export default function PedidosEnCurso() {
  const { datos } = useApi('/logistica/tablero');
  const pedidos = datos?.pedidos ?? [];
  const proxima = pedidos.find((p) => p.fecha_instalacion && p.fecha_instalacion >= hoyIso() && p.estado !== 'ENTREGADO');

  return (
    <Tarjeta
      titulo="Pedidos en curso"
      acciones={<Link to="/logistica" className="text-sm text-primary underline-offset-2 hover:underline">Ver logística</Link>}
    >
      {!datos ? (
        <p className="text-sm text-stone-500">Cargando…</p>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-3">
            {CONTADORES.map((c) => (
              <div key={c.estado} className="rounded-md bg-surface p-3">
                <dt className="text-xs text-stone-600">{c.texto}</dt>
                <dd className="text-2xl font-semibold tabular-nums text-primary">{pedidos.filter((p) => p.estado === c.estado).length}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-sm text-stone-600">
            {proxima ? `Próxima instalación: ${formatearDia(proxima.fecha_instalacion)} (${proxima.codigo}).` : 'No hay instalaciones programadas.'}
          </p>
        </>
      )}
    </Tarjeta>
  );
}
