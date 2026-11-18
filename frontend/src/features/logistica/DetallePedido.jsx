import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { Alerta, ErrorApi, Tarjeta } from '../../components/ui.jsx';
import { formatearBs, formatearDia } from '../../utils/formato.js';
import AccionesPedido from './AccionesPedido.jsx';
import EstadoPedido from './EstadoPedido.jsx';
import HistorialPedido from './HistorialPedido.jsx';
import ProgresoFases from './ProgresoFases.jsx';
import { describirPorton } from './porton.js';

function Dato({ etiqueta, children }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-stone-500">{etiqueta}</dt>
      <dd className="text-sm text-stone-800">{children}</dd>
    </div>
  );
}

/** Ficha de un pedido: datos, etapa, acciones según el rol y su historial completo (trazabilidad). */
export default function DetallePedido({ codigo, onCambio, onCerrar }) {
  const { usuario } = useAuth();
  const { datos: pedido, error, recargar } = useApi(`/logistica/pedidos/${codigo}`);
  const [aviso, setAviso] = useState(null);

  return (
    <Tarjeta
      titulo={`Pedido ${codigo}`}
      acciones={
        <button type="button" onClick={onCerrar} className="text-sm text-stone-500 hover:text-primary" aria-label="Cerrar la ficha del pedido">
          Cerrar ✕
        </button>
      }
    >
      <ErrorApi error={error} />
      {!pedido ? (
        !error && <p className="text-sm text-stone-500">Cargando…</p>
      ) : (
        <div className="space-y-5">
          <div className="space-y-2">
            <EstadoPedido estado={pedido.estado} nombre={pedido.estado_nombre} />
            <ProgresoFases estado={pedido.estado} fase={pedido.fase} />
          </div>

          <dl className="grid grid-cols-2 gap-3">
            <Dato etiqueta="Cliente">{pedido.cliente.nombre || 'Sin nombre'}</Dato>
            <Dato etiqueta="WhatsApp">+{pedido.cliente.wa_id}</Dato>
            <Dato etiqueta="Portón">
              {describirPorton({ tipo_porton: pedido.producto.tipo_porton, madera: pedido.madera?.nombre, ancho_m: pedido.ancho_m, alto_m: pedido.alto_m })}
            </Dato>
            <Dato etiqueta="Total cobrado">{formatearBs(pedido.total_final)} Bs</Dato>
            <Dato etiqueta="Instalación">{pedido.fecha_instalacion ? formatearDia(pedido.fecha_instalacion) : 'Sin programar'}</Dato>
          </dl>

          <div className="space-y-3 border-t border-stone-200 pt-4">
            {aviso && <Alerta tipo="exito">{aviso}</Alerta>}
            <AccionesPedido
              key={`${pedido.estado}-${pedido.fase?.orden}-${pedido.fecha_instalacion}`}
              pedido={pedido}
              rol={usuario.rol}
              onHecho={(mensaje) => {
                setAviso(mensaje);
                recargar();
                onCambio();
              }}
            />
          </div>

          <div className="border-t border-stone-200 pt-4">
            <h3 className="mb-3 text-sm font-semibold text-primary">Historial (trazabilidad)</h3>
            <HistorialPedido entradas={pedido.historial} />
          </div>
        </div>
      )}
    </Tarjeta>
  );
}
