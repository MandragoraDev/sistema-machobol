import { Navigate, Route, Routes } from 'react-router';
import { useAuth } from '../features/auth/AuthContext.jsx';
import RutaProtegida from '../features/auth/RutaProtegida.jsx';
import LoginPage from '../features/auth/LoginPage.jsx';
import AppLayout from '../layouts/AppLayout.jsx';
import DashboardPage from '../features/dashboard/DashboardPage.jsx';
import InventarioPage from '../features/inventario/InventarioPage.jsx';
import UsuariosPage from '../features/usuarios/UsuariosPage.jsx';

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
