import { Link } from 'react-router';
import { useApi } from '../../hooks/useApi.js';
import { Tarjeta } from '../../components/ui.jsx';
import { formatearBs } from '../../utils/formato.js';

function Indicador({ valor, texto, alerta = false }) {
  return (
    <div className={`rounded-md p-3 ${alerta ? 'bg-amber-50' : 'bg-surface/60'}`}>
      <p className={`text-2xl font-semibold tabular-nums ${alerta ? 'text-amber-800' : 'text-primary'}`}>{valor}</p>
      <p className="text-xs text-stone-600">{texto}</p>
    </div>
  );
}

/** Ventas para Admin y Ventas: reuniones por agendar, próximas, pedidos sin madera y lo cobrado en el mes. */
export default function ResumenVentas() {
  const { datos } = useApi('/ventas/resumen');
  if (!datos) return null;

  return (
    <Tarjeta
      titulo="Ventas"
      acciones={<Link to="/ventas" className="text-sm text-primary underline-offset-2 hover:underline">Ver ventas</Link>}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Indicador valor={datos.reuniones_por_agendar} texto="Reuniones por agendar" alerta={datos.reuniones_por_agendar > 0} />
        <Indicador valor={datos.reuniones_proximas} texto="Reuniones próximas" />
        <Indicador valor={datos.sin_madera} texto="Con anticipo, sin madera" alerta={datos.sin_madera > 0} />
        <Indicador valor={`${formatearBs(datos.ventas_mes.total)} Bs`} texto={`Cobrado este mes (${datos.ventas_mes.pagos} pagos)`} />
      </div>
    </Tarjeta>
  );
}
