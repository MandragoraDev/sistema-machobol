import { Boton, ErrorApi, Tarjeta, claseControl } from '../../components/ui.jsx';
import { formatearDeltaM2, formatearFechaHora, formatearM2, formatearNumero, nombreMadera } from '../../utils/formato.js';
import InsigniaMovimiento from './InsigniaMovimiento.jsx';

function detalle(m) {
  if (m.tipo === 'INGRESO') {
    const troca = `${m.piezas} × ${formatearNumero(m.ancho_pulg)}″ × ${formatearNumero(m.largo_pies)}′`;
    return m.motivo ? `${troca} · ${m.motivo}` : troca;
  }
  if (m.tipo === 'SALIDA') return `Pedido #${m.pedido_id}`;
  return m.motivo;
}

/** Kardex paginado. El estado de filtros y la carga viven en la página para poder recargar tras cada operación. */
export default function TablaMovimientos({ resultado, maderas, filtros, onFiltros }) {
  const { datos, error } = resultado;
  const totalPaginas = datos ? Math.max(1, Math.ceil(datos.total / datos.limite)) : 1;
  const filtrar = (campo) => (evento) => onFiltros({ ...filtros, [campo]: evento.target.value, pagina: 1 });

  return (
    <Tarjeta
      titulo="Movimientos de inventario"
      acciones={
        <div className="flex flex-wrap gap-2">
          <select value={filtros.madera_id} onChange={filtrar('madera_id')} className={claseControl} aria-label="Filtrar por madera">
            <option value="">Todas las maderas</option>
            {maderas.map((m) => (
              <option key={m.id} value={m.id}>{nombreMadera(m)}</option>
            ))}
          </select>
          <select value={filtros.tipo} onChange={filtrar('tipo')} className={claseControl} aria-label="Filtrar por tipo">
            <option value="">Todos los tipos</option>
            <option value="INGRESO">Ingresos</option>
            <option value="AJUSTE">Ajustes</option>
            <option value="SALIDA">Salidas</option>
          </select>
        </div>
      }
    >
      <ErrorApi error={error} />
      {!datos ? (
        !error && <p className="text-sm text-stone-500">Cargando…</p>
      ) : datos.datos.length === 0 ? (
        <p className="text-sm text-stone-600">No hay movimientos con estos filtros.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="py-2 pr-4 font-medium">Fecha</th>
                  <th className="py-2 pr-4 font-medium">Madera</th>
                  <th className="py-2 pr-4 font-medium">Tipo</th>
                  <th className="py-2 pr-4 text-right font-medium">Cantidad</th>
                  <th className="py-2 pr-4 text-right font-medium">Stock resultante</th>
                  <th className="py-2 pr-4 font-medium">Detalle</th>
                  <th className="py-2 font-medium">Usuario</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {datos.datos.map((m) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap py-3 pr-4">{formatearFechaHora(m.creado_en)}</td>
                    <td className="whitespace-nowrap py-3 pr-4">{nombreMadera(m)}</td>
                    <td className="py-3 pr-4"><InsigniaMovimiento tipo={m.tipo} /></td>
                    <td className="whitespace-nowrap py-3 pr-4 text-right tabular-nums">{formatearDeltaM2(m.cantidad_m2)}</td>
                    <td className="whitespace-nowrap py-3 pr-4 text-right tabular-nums">{formatearM2(m.stock_resultante_m2)}</td>
                    <td className="py-3 pr-4 text-stone-600">{detalle(m)}</td>
                    <td className="whitespace-nowrap py-3">{m.usuario ?? 'Sistema'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-stone-600">
            <span>{datos.total} movimientos · página {datos.pagina} de {totalPaginas}</span>
            <div className="flex gap-2">
              <Boton variante="secundario" className="px-3 py-1.5" disabled={filtros.pagina <= 1}
                onClick={() => onFiltros({ ...filtros, pagina: filtros.pagina - 1 })}>
                Anterior
              </Boton>
              <Boton variante="secundario" className="px-3 py-1.5" disabled={filtros.pagina >= totalPaginas}
                onClick={() => onFiltros({ ...filtros, pagina: filtros.pagina + 1 })}>
                Siguiente
              </Boton>
            </div>
          </div>
        </>
      )}
    </Tarjeta>
  );
}
