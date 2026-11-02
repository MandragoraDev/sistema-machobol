const BASE_URL = '/api';

/** Error de la API con el código HTTP y el cuerpo JSON (si lo hubo). */
export class ApiError extends Error {
  constructor(status, mensaje, datos) {
    super(mensaje);
    this.name = 'ApiError';
    this.status = status;
    this.datos = datos;
  }
}

export async function apiGet(ruta) {
  const res = await fetch(`${BASE_URL}${ruta}`);
  const datos = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, datos?.error || `Error HTTP ${res.status}`, datos);
  }
  return datos;
}
