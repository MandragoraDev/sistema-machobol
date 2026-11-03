import { Navigate, useLocation } from 'react-router';
import { useAuth } from './AuthContext.jsx';

export function PantallaCarga() {
  return (
    <div className="grid min-h-screen place-items-center text-sm text-stone-500" role="status">
      Cargando…
    </div>
  );
}

/**
 * Sin sesión redirige a /login recordando la página pedida (salvo tras "Cerrar sesión").
 * Con un rol no permitido, al Dashboard.
 */
export default function RutaProtegida({ roles, children }) {
  const { usuario, verificando, cierreVoluntario } = useAuth();
  const location = useLocation();

  if (!usuario) {
    return <Navigate to="/login" replace state={cierreVoluntario ? null : { desde: location.pathname }} />;
  }
  if (verificando) {
    return <PantallaCarga />;
  }
  if (roles && !roles.includes(usuario.rol)) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}
