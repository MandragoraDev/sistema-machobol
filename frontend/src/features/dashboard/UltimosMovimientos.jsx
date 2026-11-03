import { Link } from 'react-router';
import { Tarjeta } from '../../components/ui.jsx';
import { formatearDeltaM2, formatearFechaHora, nombreMadera } from '../../utils/formato.js';
import InsigniaMovimiento from '../inventario/InsigniaMovimiento.jsx';

export default function UltimosMovimientos({ movimientos }) {
  return (
    <Tarjeta
      titulo="Últimos movimientos"
      acciones={
        <Link to="/inventario" className="text-sm text-primary underline-offset-2 hover:underline">
          Ver todos
        </Link>
      }
    >
      {!movimientos ? (
        <p className="text-sm text-stone-500">Cargando…</p>
      ) : movimientos.length === 0 ? (
        <p className="text-sm text-stone-600">Aún no hay movimientos de inventario.</p>
      ) : (
        <ul className="divide-y divide-stone-200">
          {movimientos.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{nombreMadera(m)}</p>
                <p className="text-xs text-stone-500">
                  {formatearFechaHora(m.creado_en)}
                  {m.usuario && ` · ${m.usuario}`}
                </p>
              </div>
              <div className="text-right">
                <InsigniaMovimiento tipo={m.tipo} />
                <p className="mt-1 text-sm font-medium">{formatearDeltaM2(m.cantidad_m2)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}
