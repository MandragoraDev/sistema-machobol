import EstadoSistema from './EstadoSistema.jsx';

export default function DashboardPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold text-primary">Panel de gestión</h1>
      <p className="mt-1 text-sm text-stone-600">
        Base del sistema lista.
      </p>
      <div className="mt-8">
        <EstadoSistema />
      </div>
    </div>
  );
}
