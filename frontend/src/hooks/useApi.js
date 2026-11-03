import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';

/**
 * Carga `ruta` (GET) al montar y cada vez que cambian la ruta o `query`.
 * Con `ruta` null no hace nada. Ignora respuestas viejas si llega una petición más nueva.
 */
export function useApi(ruta, query) {
  const clave = ruta ? `${ruta}?${JSON.stringify(query ?? {})}` : null;
  const [estado, setEstado] = useState({ datos: null, error: null, cargando: Boolean(ruta) });
  const ultimaPeticion = useRef(0);

  const cargar = useCallback(async () => {
    if (!clave) return;
    const id = ++ultimaPeticion.current;
    setEstado((actual) => ({ ...actual, cargando: true, error: null }));
    try {
      const datos = await api(ruta, { query });
      if (id === ultimaPeticion.current) setEstado({ datos, error: null, cargando: false });
    } catch (error) {
      if (id === ultimaPeticion.current) setEstado({ datos: null, error, cargando: false });
    }
    // `clave` resume ruta y query: no hace falta depender del objeto query (cambia en cada render).
  }, [clave]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return { ...estado, recargar: cargar };
}
