// Formato de cifras y fechas para documentos y mensajes al cliente (Bolivia): 23.476,50 · 04/11/2026 15:05.
const ZONA_HORARIA = 'America/La_Paz';

/** Texto decimal ("23476.50") → "23.476,50". Recibe el valor exacto de PostgreSQL, sin pasar por float. */
function formatearDecimal(texto, decimales = 2) {
  const valor = String(texto);
  const signo = valor.startsWith('-') ? '-' : '';
  const [entero, fraccion = ''] = valor.replace('-', '').split('.');
  const miles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return decimales > 0 ? `${signo}${miles},${fraccion.padEnd(decimales, '0').slice(0, decimales)}` : `${signo}${miles}`;
}

/** m² con 2 a 4 decimales: "8.8000" → "8,80"; "7.1595" → "7,1595". */
function formatearM2(texto) {
  const [, fraccion = ''] = String(texto).split('.');
  return formatearDecimal(texto, Math.max(2, fraccion.replace(/0+$/, '').length));
}

function formatearFecha(fecha) {
  return fecha.toLocaleDateString('es-BO', { timeZone: ZONA_HORARIA, day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatearFechaHora(fecha) {
  const hora = fecha.toLocaleTimeString('es-BO', { timeZone: ZONA_HORARIA, hour: '2-digit', minute: '2-digit', hour12: false });
  return `${formatearFecha(fecha)} ${hora}`;
}

/** "59171234567" → "+591 71234567". */
function formatearTelefono(waId) {
  return waId.startsWith('591') ? `+591 ${waId.slice(3)}` : `+${waId}`;
}

/** { especie: 'tajibo', espesor_pulg: '1.50' } → "Tajibo 1,5″" (con `pulgadas: ' pulg.'` para los PDF, que no tienen ″). */
function nombreMadera({ especie, espesor_pulg }, { pulgadas = '″' } = {}) {
  const espesor = String(Number(espesor_pulg)).replace('.', ',');
  return `${especie.charAt(0).toUpperCase()}${especie.slice(1)} ${espesor}${pulgadas}`;
}

module.exports = { formatearDecimal, formatearM2, formatearFecha, formatearFechaHora, formatearTelefono, nombreMadera };
