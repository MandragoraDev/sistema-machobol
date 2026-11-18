// Recorrido operativo de un pedido pagado (PLAN §2.4). Funciones puras.
//
//   EN_PRODUCCION, fases 1 a 10 (taller) → EN_RUTA, fase 11 (despacho e instalación) → ENTREGADO
//
// Solo se avanza al paso siguiente. Retroceder es un único paso hacia atrás (solo Admin, con motivo).
const TOTAL_FASES = 11;
// Al cerrar la fase 10 (control de calidad y despacho), el portón sale del taller rumbo a la instalación.
const FASE_DESPACHO = 10;

const ESTADOS_OPERATIVOS = ['EN_PRODUCCION', 'EN_RUTA', 'ENTREGADO'];

/** Paso siguiente ({ estado, fase }) o null si el pedido ya está entregado. */
function siguientePaso({ estado, fase }) {
  if (estado === 'EN_PRODUCCION' && fase < FASE_DESPACHO) return { estado, fase: fase + 1 };
  if (estado === 'EN_PRODUCCION' && fase === FASE_DESPACHO) return { estado: 'EN_RUTA', fase: TOTAL_FASES };
  if (estado === 'EN_RUTA') return { estado: 'ENTREGADO', fase: TOTAL_FASES };
  return null;
}

/** Paso anterior ({ estado, fase }) o null si el pedido está en la fase 1. */
function pasoAnterior({ estado, fase }) {
  if (estado === 'ENTREGADO') return { estado: 'EN_RUTA', fase: TOTAL_FASES };
  if (estado === 'EN_RUTA') return { estado: 'EN_PRODUCCION', fase: FASE_DESPACHO };
  if (estado === 'EN_PRODUCCION' && fase > 1) return { estado, fase: fase - 1 };
  return null;
}

/** Texto del botón o del historial para un paso: "Fase 5: Armado de estructura", "Despachar (en ruta)"… */
function describirPaso(paso, nombresFases) {
  if (!paso) return null;
  if (paso.estado === 'EN_RUTA') return `En ruta / instalación (fase ${TOTAL_FASES}: ${nombresFases[TOTAL_FASES]})`;
  if (paso.estado === 'ENTREGADO') return 'Entregado / instalado';
  return `Fase ${paso.fase}: ${nombresFases[paso.fase]}`;
}

module.exports = { TOTAL_FASES, FASE_DESPACHO, ESTADOS_OPERATIVOS, siguientePaso, pasoAnterior, describirPaso };
