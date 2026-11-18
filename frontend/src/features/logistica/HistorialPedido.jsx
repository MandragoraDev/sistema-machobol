import { ETIQUETA_ROL, formatearFechaHoraExacta } from '../../utils/formato.js';

function etapa(estado, estadoNombre, fase, faseNombre) {
  if (estado === 'EN_PRODUCCION' && fase) return `En producción · fase ${fase}: ${faseNombre}`;
  return estadoNombre;
}

/** Historial inmutable del pedido, del cambio más reciente al más antiguo, con la hora exacta de cada uno. */
export default function HistorialPedido({ entradas }) {
  return (
    <ol className="max-h-96 space-y-3 overflow-y-auto pr-1">
      {[...entradas].reverse().map((h) => (
        <li key={h.id} className="border-l-2 border-primary/30 pl-3">
          <p className="text-xs tabular-nums text-stone-500">
            <time dateTime={h.creado_en}>{formatearFechaHoraExacta(h.creado_en)}</time>
            {' · '}
            {h.usuario ? `${h.usuario} (${ETIQUETA_ROL[h.usuario_rol] ?? h.usuario_rol})` : 'Sistema'}
          </p>
          <p className="text-sm text-stone-800">
            {h.estado_anterior && (
              <span className="text-stone-500">{etapa(h.estado_anterior, h.estado_anterior_nombre, h.fase_anterior, h.fase_anterior_nombre)} → </span>
            )}
            <span className="font-medium">{etapa(h.estado_nuevo, h.estado_nuevo_nombre, h.fase_nueva, h.fase_nueva_nombre)}</span>
          </p>
          {h.motivo && <p className="text-xs italic text-stone-600">{h.motivo}</p>}
        </li>
      ))}
    </ol>
  );
}
