import { formatearM2 } from '../../utils/formato.js';

function Indicador({ etiqueta, valor, destacado = false }) {
  return (
    <div className={`rounded-lg border bg-white p-5 shadow-sm ${destacado ? 'border-red-200' : 'border-primary/15'}`}>
      <p className="text-sm text-stone-600">{etiqueta}</p>
      <p className={`mt-1 text-2xl font-semibold ${destacado ? 'text-red-700' : 'text-primary'}`}>{valor}</p>
    </div>
  );
}

export default function ResumenInventario({ resumen }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Indicador etiqueta="Stock total de madera" valor={resumen ? formatearM2(resumen.stock_total_m2) : '—'} />
      <Indicador etiqueta="Tipos de madera activos" valor={resumen ? resumen.maderas : '—'} />
      <Indicador
        etiqueta="Bajo el stock mínimo"
        valor={resumen ? resumen.bajo_minimo : '—'}
        destacado={resumen?.bajo_minimo > 0}
      />
    </div>
  );
}
