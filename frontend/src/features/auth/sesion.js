const CLAVE_TOKEN = 'machobol.token';

// Respaldo en memoria por si el navegador bloquea localStorage (modo privado estricto).
let tokenEnMemoria = null;

export function leerToken() {
  try {
    return localStorage.getItem(CLAVE_TOKEN) ?? tokenEnMemoria;
  } catch {
    return tokenEnMemoria;
  }
}

export function guardarToken(token) {
  tokenEnMemoria = token;
  try {
    localStorage.setItem(CLAVE_TOKEN, token);
  } catch {
    // Sin almacenamiento: la sesión dura mientras la pestaña esté abierta.
  }
}

export function borrarToken() {
  tokenEnMemoria = null;
  try {
    localStorage.removeItem(CLAVE_TOKEN);
  } catch {
    // Nada que borrar.
  }
}

/**
 * Lee el usuario (id, nombre, rol) del payload del JWT. No verifica la firma: eso lo hace la API.
 * Devuelve null si el token no es legible o ya expiró.
 */
export function usuarioDelToken(token) {
  if (!token) return null;
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    if (!payload.exp || payload.exp * 1000 <= Date.now()) return null;
    return { id: Number(payload.sub), nombre: payload.nombre, rol: payload.rol };
  } catch {
    return null;
  }
}
