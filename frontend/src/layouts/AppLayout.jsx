import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../features/auth/AuthContext.jsx';
import { ETIQUETA_ROL } from '../utils/formato.js';

// Sin `roles`, el enlace es visible para todos los usuarios con sesión.
const NAVEGACION = [
  { ruta: '/dashboard', nombre: 'Dashboard' },
  { ruta: '/inventario', nombre: 'Inventario de madera' },
  { ruta: '/usuarios', nombre: 'Usuarios', roles: ['ADMIN'] },
];

function Marca() {
  return (
    <div>
      <p className="text-xl font-bold tracking-widest">MACHOBOL</p>
      <p className="text-xs text-surface/70">Portones y parques infantiles</p>
    </div>
  );
}

export default function AppLayout() {
  const { usuario, cerrarSesion } = useAuth();
  const enlaces = NAVEGACION.filter((item) => !item.roles || item.roles.includes(usuario.rol));

  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden w-64 shrink-0 flex-col bg-primary px-5 py-6 text-surface md:sticky md:top-0 md:flex md:h-screen">
        <Marca />
        <nav className="mt-10 flex-1 space-y-1">
          {enlaces.map((item) => (
            <NavLink
              key={item.ruta}
              to={item.ruta}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm ${isActive ? 'bg-surface/15 font-medium' : 'text-surface/80 hover:bg-surface/10'}`
              }
            >
              {item.nombre}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-surface/20 pt-4">
          <p className="truncate text-sm font-medium">{usuario.nombre}</p>
          <p className="text-xs text-surface/70">{ETIQUETA_ROL[usuario.rol]}</p>
          <button type="button" onClick={cerrarSesion} className="mt-3 text-sm text-surface/80 underline-offset-2 hover:underline">
            Cerrar sesión
          </button>
        </div>
      </aside>

      <header className="bg-primary px-4 py-3 text-surface md:hidden">
        <div className="flex items-center justify-between gap-4">
          <Marca />
          <button type="button" onClick={cerrarSesion} className="text-sm underline-offset-2 hover:underline">
            Salir
          </button>
        </div>
        <nav className="mt-3 flex gap-1 overflow-x-auto">
          {enlaces.map((item) => (
            <NavLink
              key={item.ruta}
              to={item.ruta}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-md px-3 py-1.5 text-sm ${isActive ? 'bg-surface/15 font-medium' : 'text-surface/80'}`
              }
            >
              {item.nombre}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-8">
        <Outlet />
      </main>
    </div>
  );
}
