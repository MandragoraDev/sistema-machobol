import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { Alerta, ErrorApi, Tarjeta } from '../../components/ui.jsx';
import { formatearBs, formatearDia, formatearFechaHora } from '../../utils/formato.js';
import AccionesVenta from '../ventas/AccionesVenta.jsx';
import CuentaPedido from '../ventas/CuentaPedido.jsx';
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

// Antes de la producción: la venta (reunión, precio acordado, anticipo). Después: la logística (fases, instalación).
const ESTADOS_VENTA = ['COTIZADO', 'REUNION_SOLICITADA', 'REUNION_AGENDADA'];

function Seccion({ titulo, children }) {
  return (
    <div className="border-t border-stone-200 pt-4">
      <h3 className="mb-3 text-sm font-semibold text-primary">{titulo}</h3>
      {children}
    </div>
  );
}

/** Ficha de un pedido: datos, venta, pagos, etapa, acciones según el rol y su historial completo (trazabilidad). */
export default function DetallePedido({ codigo, onCambio, onCerrar }) {
  const { usuario } = useAuth();
  const { datos: pedido, error, recargar } = useApi(`/logistica/pedidos/${codigo}`);
  const [aviso, setAviso] = useState(null);

  const alTerminar = (mensaje, tipo = 'exito') => {
    setAviso({ mensaje, tipo });
    recargar();
    onCambio();
  };
  const enVenta = pedido && ESTADOS_VENTA.includes(pedido.estado);
  const vendeOAdministra = ['ADMIN', 'VENTAS'].includes(usuario.rol);

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
            <Dato etiqueta={pedido.precio_acordado ? 'Precio acordado' : 'Precio referencial'}>
              {formatearBs(pedido.total_final)} Bs
              {pedido.precio_acordado && <span className="block text-xs text-stone-500">Cotizado: {formatearBs(pedido.total_exacto)} Bs</span>}
            </Dato>
            <Dato etiqueta="Instalación">
              {pedido.fecha_instalacion ? formatearDia(pedido.fecha_instalacion) : 'Sin programar'}
              {pedido.fuera_ciudad && <span className="block text-xs text-stone-500">Fuera de la ciudad: traslado a acordar</span>}
            </Dato>
            {(pedido.reunion.fecha || pedido.reunion.preferencia) && (
              <Dato etiqueta="Reunión">
                {pedido.reunion.fecha ? formatearFechaHora(pedido.reunion.fecha) : 'Por agendar'}
                {pedido.reunion.preferencia && <span className="block text-xs text-stone-500">Prefiere: {pedido.reunion.preferencia}</span>}
              </Dato>
            )}
          </dl>

          {aviso && <Alerta tipo={aviso.tipo}>{aviso.mensaje}</Alerta>}

          {enVenta && vendeOAdministra && (
            <Seccion titulo="Venta">
              <AccionesVenta key={`${pedido.estado}-${pedido.total_final}-${pedido.reunion.fecha}-${pedido.cuenta.pagado}`} pedido={pedido} rol={usuario.rol} onHecho={alTerminar} />
            </Seccion>
          )}

          <Seccion titulo="Pagos">
            <CuentaPedido key={`${pedido.cuenta.pagado}-${pedido.cuenta.pagos.length}-${pedido.total_final}`} pedido={pedido} rol={usuario.rol} onHecho={alTerminar} />
          </Seccion>

          {!enVenta && (
            <Seccion titulo="Etapa">
              <AccionesPedido
                key={`${pedido.estado}-${pedido.fase?.orden}-${pedido.fecha_instalacion}`}
                pedido={pedido}
                rol={usuario.rol}
                onHecho={alTerminar}
              />
            </Seccion>
          )}

          <Seccion titulo="Historial (trazabilidad)">
            <HistorialPedido entradas={pedido.historial} />
          </Seccion>
        </div>
      )}
    </Tarjeta>
  );
}
