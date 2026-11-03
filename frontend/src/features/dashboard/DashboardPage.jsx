import { Link } from 'react-router';
import { useAuth } from '../auth/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { EncabezadoPagina, ErrorApi } from '../../components/ui.jsx';
import ResumenInventario from './ResumenInventario.jsx';
import AlertasStock from './AlertasStock.jsx';
import UltimosMovimientos from './UltimosMovimientos.jsx';
import StockDisponible from './StockDisponible.jsx';
import EstadoSistema from './EstadoSistema.jsx';

const DESCRIPCION_POR_ROL = {
  ADMIN: 'Resumen general del inventario y del sistema.',
  TALLER: 'Stock de madera, alertas y registro de trocas.',
  VENTAS: 'Madera disponible para tus cotizaciones.',
};

/** Cada rol ve un Dashboard distinto; el rol sale del token de la sesión. */
export default function DashboardPage() {
  const { usuario } = useAuth();
  const { rol } = usuario;
  const inventario = useApi('/inventario');
  const movimientos = useApi(rol === 'VENTAS' ? null : '/inventario/movimientos', { limite: 5 });
  const maderas = inventario.datos?.maderas;

  return (
    <div className="max-w-6xl space-y-6">
      <EncabezadoPagina
        titulo={`Hola, ${usuario.nombre.split(' ')[0]}`}
        descripcion={DESCRIPCION_POR_ROL[rol]}
        acciones={
          rol !== 'VENTAS' && (
            <Link to="/inventario" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90">
              Registrar ingreso de troca
            </Link>
          )
        }
      />

      <ErrorApi error={inventario.error} />
      <ResumenInventario resumen={inventario.datos?.resumen} />

      {rol === 'VENTAS' ? (
        <StockDisponible maderas={maderas} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <AlertasStock maderas={maderas} />
          <UltimosMovimientos movimientos={movimientos.datos?.datos} />
        </div>
      )}

      {rol === 'ADMIN' && <EstadoSistema />}
    </div>
  );
}
