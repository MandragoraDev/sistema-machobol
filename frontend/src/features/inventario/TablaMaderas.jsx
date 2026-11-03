import { Tarjeta } from '../../components/ui.jsx';
import { formatearM2, nombreMadera } from '../../utils/formato.js';
import EstadoMadera from './EstadoMadera.jsx';

/** `onEditar` e `onIncluirInactivas` solo llegan para el Admin. */
export default function TablaMaderas({ maderas, onEditar, incluirInactivas, onIncluirInactivas }) {
  return (
    <Tarjeta
      titulo="Stock por madera"
      acciones={
        onIncluirInactivas && (
          <label className="flex items-center gap-2 text-sm text-stone-600">
            <input type="checkbox" checked={incluirInactivas} onChange={(e) => onIncluirInactivas(e.target.checked)} />
            Mostrar inactivas
          </label>
        )
      }
    >
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
                <th className="py-2 pr-4 text-right font-medium">Stock actual</th>
                <th className="py-2 pr-4 text-right font-medium">Mínimo</th>
                <th className="py-2 pr-4 font-medium">Estado</th>
                {onEditar && <th className="py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {maderas.map((m) => (
                <tr key={m.id} className={m.activo ? '' : 'text-stone-400'}>
                  <td className="py-3 pr-4 font-medium">{nombreMadera(m)}</td>
                  <td className="py-3 pr-4 text-right tabular-nums">{formatearM2(m.stock_actual_m2)}</td>
                  <td className="py-3 pr-4 text-right tabular-nums">{formatearM2(m.stock_minimo_m2)}</td>
                  <td className="py-3 pr-4">
                    <EstadoMadera madera={m} />
                  </td>
                  {onEditar && (
                    <td className="py-3 text-right">
                      <button type="button" onClick={() => onEditar(m)} className="text-sm text-primary underline-offset-2 hover:underline">
                        Editar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Tarjeta>
  );
}
