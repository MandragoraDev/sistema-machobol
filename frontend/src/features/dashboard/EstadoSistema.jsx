import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { Boton, Tarjeta } from '../../components/ui.jsx';

const ESTILOS = {
  verificando: { texto: 'Verificando…', clase: 'bg-stone-200 text-stone-600' },
  ok: { texto: 'En línea', clase: 'bg-accent/15 text-accent' },
  caido: { texto: 'Sin conexión', clase: 'bg-red-100 text-red-700' },
};

function Indicador({ etiqueta, estado }) {
  const { texto, clase } = ESTILOS[estado];
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-sm">{etiqueta}</span>
      <span className={`rounded-full px-3 py-1 text-xs font-medium ${clase}`}>{texto}</span>
    </div>
  );
}

export default function EstadoSistema() {
  const [estado, setEstado] = useState({ api: 'verificando', db: 'verificando', hora: null });

  const verificar = useCallback(async () => {
    setEstado({ api: 'verificando', db: 'verificando', hora: null });
    try {
      await api('/health');
      setEstado({ api: 'ok', db: 'ok', hora: new Date() });
    } catch (err) {
      // 503: la API responde pero PostgreSQL no. Cualquier otro error: la API no responde.
      const apiResponde = err.status === 503;
      setEstado({ api: apiResponde ? 'ok' : 'caido', db: 'caido', hora: new Date() });
    }
  }, []);

  useEffect(() => {
    verificar();
  }, [verificar]);

  return (
    <Tarjeta
      titulo="Estado del sistema"
      acciones={
        <Boton variante="secundario" onClick={verificar} className="px-3 py-1.5">
          Volver a verificar
        </Boton>
      }
    >
      <div className="divide-y divide-stone-200">
        <Indicador etiqueta="API REST (Node.js + Express)" estado={estado.api} />
        <Indicador etiqueta="Base de datos (PostgreSQL)" estado={estado.db} />
      </div>
      {estado.hora && (
        <p className="mt-3 text-xs text-stone-500">Última verificación: {estado.hora.toLocaleTimeString('es-BO')}</p>
      )}
    </Tarjeta>
  );
}
