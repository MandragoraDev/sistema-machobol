const M2 = new Intl.NumberFormat('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const DECIMAL = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 4 });
const FECHA_HORA = new Intl.DateTimeFormat('es-BO', { dateStyle: 'short', timeStyle: 'short' });

export const ETIQUETA_ROL = { ADMIN: 'Administrador', VENTAS: 'Ventas', TALLER: 'Taller' };

export function formatearM2(valor) {
  return `${M2.format(Number(valor))} m²`;
}

/** m² con signo, para movimientos: "+6,1935 m²" / "−1,50 m²". */
export function formatearDeltaM2(valor) {
  const numero = Number(valor);
  return `${numero > 0 ? '+' : numero < 0 ? '−' : ''}${M2.format(Math.abs(numero))} m²`;
}

export function formatearNumero(valor) {
  return DECIMAL.format(Number(valor));
}

export function formatearFechaHora(fecha) {
  return FECHA_HORA.format(new Date(fecha));
}

/** "Cedro 1″", "Mara 1,5″". */
export function nombreMadera(madera) {
  return `${madera.especie} ${formatearNumero(madera.espesor_pulg)}″`;
}
