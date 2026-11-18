const M2 = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
// useGrouping 'always': en español, Intl no agrupa los miles de números de 4 cifras ("2470,00").
const BS = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' });
const DECIMAL = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 4 });
const FECHA_HORA = new Intl.DateTimeFormat('es-BO', { dateStyle: 'short', timeStyle: 'short' });
// Para la trazabilidad: fecha completa y hora con segundos.
const FECHA_HORA_EXACTA = new Intl.DateTimeFormat('es-BO', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});
const DIA_MS = 86_400_000;

export const ETIQUETA_ROL = { ADMIN: 'Administrador', VENTAS: 'Ventas', TALLER: 'Taller' };

export function formatearM2(valor) {
  return `${M2.format(Number(valor))} m²`;
}

/** m² con signo, para movimientos: "+6,1935 m²" / "−1,50 m²". */
export function formatearDeltaM2(valor) {
  const numero = Number(valor);
  return `${numero > 0 ? '+' : numero < 0 ? '−' : ''}${M2.format(Math.abs(numero))} m²`;
}

/** "2470.00" → "2.470,00". */
export function formatearBs(valor) {
  return BS.format(Number(valor));
}

export function formatearNumero(valor) {
  return DECIMAL.format(Number(valor));
}

export function formatearFechaHora(fecha) {
  return FECHA_HORA.format(new Date(fecha));
}

/** "11/11/2026 15:32:07". */
export function formatearFechaHoraExacta(fecha) {
  return FECHA_HORA_EXACTA.format(new Date(fecha)).replace(',', '');
}

/** Fecha sin hora de la API ("2026-11-13") → "13/11/2026", sin pasar por zonas horarias. */
export function formatearDia(iso) {
  const [anio, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${anio}`;
}

/** Hoy en formato AAAA-MM-DD (para el mínimo de un input date). */
export function hoyIso() {
  const ahora = new Date();
  return new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/** "hoy", "hace 1 día", "hace 5 días". */
export function haceDias(fecha) {
  const dias = Math.floor((Date.now() - new Date(fecha).getTime()) / DIA_MS);
  if (dias <= 0) return 'hoy';
  return dias === 1 ? 'hace 1 día' : `hace ${dias} días`;
}

/** "Cedro 1″", "Mara 1,5″". */
export function nombreMadera(madera) {
  return `${madera.especie} ${formatearNumero(madera.espesor_pulg)}″`;
}
