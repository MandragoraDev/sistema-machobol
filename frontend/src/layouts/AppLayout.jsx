const NAVEGACION = [
  { nombre: 'Dashboard', activo: true },
  { nombre: 'Inventario de madera', sprint: 2 },
  { nombre: 'Usuarios', sprint: 2 },
  { nombre: 'Pedidos y cotizaciones', sprint: 4 },
  { nombre: 'Logística (Kanban)', sprint: 5 },
];

function Marca() {
  return (
    <div>
      <p className="text-xl font-bold tracking-widest">MACHOBOL</p>
      <p className="text-xs text-surface/70">Portones y parques infantiles</p>
    </div>
  );
}

export default function AppLayout({ children }) {
  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden w-64 shrink-0 flex-col bg-primary px-5 py-6 text-surface md:flex">
        <Marca />
        <nav className="mt-10 space-y-1">
          {NAVEGACION.map((item) =>
            item.activo ? (
              <span key={item.nombre} className="block rounded-md bg-surface/15 px-3 py-2 text-sm font-medium">
                {item.nombre}
              </span>
            ) : (
              <span
                key={item.nombre}
                className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-surface/50"
                title={`Disponible en el Sprint ${item.sprint}`}
              >
                {item.nombre}
                <span className="text-[10px] uppercase tracking-wide">S{item.sprint}</span>
              </span>
            ),
          )}
        </nav>
      </aside>

      <header className="bg-primary px-4 py-3 text-surface md:hidden">
        <Marca />
      </header>

      <main className="flex-1 px-4 py-6 md:px-10 md:py-8">{children}</main>
    </div>
  );
}
