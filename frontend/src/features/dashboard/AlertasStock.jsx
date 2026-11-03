import { Insignia, Tarjeta } from '../../components/ui.jsx';
import { formatearM2, nombreMadera } from '../../utils/formato.js';

export default function AlertasStock({ maderas }) {
  const alertas = maderas?.filter((m) => m.bajo_minimo) ?? [];

  return (
    <Tarjeta titulo="Alertas de stock">
      {!maderas ? (
        <p className="text-sm text-stone-500">Cargando…</p>
      ) : alertas.length === 0 ? (
        <p className="text-sm text-stone-600">Todas las maderas están por encima de su stock mínimo.</p>
      ) : (
        <ul className="divide-y divide-stone-200">
          {alertas.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-medium">{nombreMadera(m)}</p>
                <p className="text-xs text-stone-500">
                  {formatearM2(m.stock_actual_m2)} de un mínimo de {formatearM2(m.stock_minimo_m2)}
                </p>
              </div>
              <Insignia tono={Number(m.stock_actual_m2) === 0 ? 'peligro' : 'alerta'}>
                {Number(m.stock_actual_m2) === 0 ? 'Sin stock' : 'Bajo mínimo'}
              </Insignia>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}
