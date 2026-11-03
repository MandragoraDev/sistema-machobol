import { leerToken } from '../features/auth/sesion.js';

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

let manejadorNoAutorizado = null;

/** Registra qué hacer cuando la API rechaza el token (401): lo usa el AuthProvider para cerrar la sesión. */
export function alNoAutorizado(manejador) {
  manejadorNoAutorizado = manejador;
}

function construirUrl(ruta, query) {
  if (!query) return `${BASE_URL}${ruta}`;
  const parametros = Object.entries(query).filter(([, valor]) => valor !== undefined && valor !== null && valor !== '');
  return parametros.length ? `${BASE_URL}${ruta}?${new URLSearchParams(parametros)}` : `${BASE_URL}${ruta}`;
}

export async function api(ruta, { method = 'GET', body, query } = {}) {
  const token = leerToken();
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(construirUrl(ruta, query), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const datos = await res.json().catch(() => null);

  if (res.status === 401 && token) {
    manejadorNoAutorizado?.();
  }
  if (!res.ok) {
    throw new ApiError(res.status, datos?.error || `Error HTTP ${res.status}`, datos);
  }
  return datos;
}
