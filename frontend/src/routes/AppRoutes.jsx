import { Navigate, Route, Routes } from 'react-router';
import { useAuth } from '../features/auth/AuthContext.jsx';
import RutaProtegida from '../features/auth/RutaProtegida.jsx';
import LoginPage from '../features/auth/LoginPage.jsx';
import AppLayout from '../layouts/AppLayout.jsx';
import DashboardPage from '../features/dashboard/DashboardPage.jsx';
import InventarioPage from '../features/inventario/InventarioPage.jsx';
import UsuariosPage from '../features/usuarios/UsuariosPage.jsx';
import LogisticaPage from '../features/logistica/LogisticaPage.jsx';
import VentasPage from '../features/ventas/VentasPage.jsx';
import ConfiguracionPage from '../features/configuracion/ConfiguracionPage.jsx';

export default function AppRoutes() {
  const { usuario } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <RutaProtegida>
            <AppLayout />
          </RutaProtegida>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/inventario" element={<InventarioPage />} />
        <Route path="/logistica" element={<LogisticaPage />} />
        <Route
          path="/ventas"
          element={
            <RutaProtegida roles={['ADMIN', 'VENTAS']}>
              <VentasPage />
            </RutaProtegida>
          }
        />
        <Route
          path="/configuracion"
          element={
            <RutaProtegida roles={['ADMIN']}>
              <ConfiguracionPage />
            </RutaProtegida>
          }
        />
        <Route
          path="/usuarios"
          element={
            <RutaProtegida roles={['ADMIN']}>
              <UsuariosPage />
            </RutaProtegida>
          }
        />
      </Route>

      {/* No hay web pública: la raíz y cualquier otra ruta llevan al login o al Dashboard. */}
      <Route path="*" element={<Navigate to={usuario ? '/dashboard' : '/login'} replace />} />
    </Routes>
  );
}
