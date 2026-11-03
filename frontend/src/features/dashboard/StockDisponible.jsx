import { Tarjeta } from '../../components/ui.jsx';
import { formatearM2, nombreMadera } from '../../utils/formato.js';
import EstadoMadera from '../inventario/EstadoMadera.jsx';

/** Vista de Ventas: qué madera hay disponible, sin acciones de inventario. */
export default function StockDisponible({ maderas }) {
  return (
    <Tarjeta titulo="Stock disponible">
      {!maderas ? (
        <p className="text-sm text-stone-500">Cargando…</p>
      ) : maderas.length === 0 ? (
        <p className="text-sm text-stone-600">No hay maderas registradas.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="py-2 pr-4 font-medium">Madera</th>
                <th className="py-2 pr-4 text-right font-medium">Disponible</th>
                <th className="py-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {maderas.map((m) => (
                <tr key={m.id}>
                  <td className="py-3 pr-4 font-medium">{nombreMadera(m)}</td>
                  <td className="py-3 pr-4 text-right tabular-nums">{formatearM2(m.stock_actual_m2)}</td>
                  <td className="py-3">
                    <EstadoMadera madera={m} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Tarjeta>
  );
}
