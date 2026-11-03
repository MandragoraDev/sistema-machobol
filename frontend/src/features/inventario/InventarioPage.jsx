import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { Boton, EncabezadoPagina, ErrorApi, Tarjeta } from '../../components/ui.jsx';
import TablaMaderas from './TablaMaderas.jsx';
import TablaMovimientos from './TablaMovimientos.jsx';
import FormIngresoTroca from './FormIngresoTroca.jsx';
import FormAjuste from './FormAjuste.jsx';
import FormMadera from './FormMadera.jsx';

const OPERACIONES = [
  { valor: 'ingreso', texto: 'Ingreso de troca' },
  { valor: 'ajuste', texto: 'Ajuste manual' },
];

export default function InventarioPage() {
  const { usuario } = useAuth();
  const esAdmin = usuario.rol === 'ADMIN';
  const puedeIngresar = esAdmin || usuario.rol === 'TALLER';

  const [incluirInactivas, setIncluirInactivas] = useState(false);
  const [filtros, setFiltros] = useState({ madera_id: '', tipo: '', pagina: 1 });
  const [maderaEnEdicion, setMaderaEnEdicion] = useState(null); // null | 'nueva' | madera
  const [operacion, setOperacion] = useState('ingreso');

  const inventario = useApi('/inventario', incluirInactivas ? { incluir_inactivas: 'true' } : undefined);
  const movimientos = useApi('/inventario/movimientos', { ...filtros, limite: 10 });

  const maderas = inventario.datos?.maderas;
  const maderasActivas = maderas?.filter((m) => m.activo) ?? [];

  function recargar() {
    inventario.recargar();
    movimientos.recargar();
  }

  return (
    <div className="max-w-7xl space-y-6">
      <EncabezadoPagina
        titulo="Inventario de madera"
        descripcion="El stock se lleva en m². Las trocas se registran en pulgadas × pies y se convierten automáticamente."
        acciones={esAdmin && !maderaEnEdicion && <Boton onClick={() => setMaderaEnEdicion('nueva')}>Nueva madera</Boton>}
      />

      {maderaEnEdicion && (
        <FormMadera
          key={maderaEnEdicion === 'nueva' ? 'nueva' : maderaEnEdicion.id}
          madera={maderaEnEdicion === 'nueva' ? null : maderaEnEdicion}
          onCancelar={() => setMaderaEnEdicion(null)}
          onGuardado={() => {
            setMaderaEnEdicion(null);
            recargar();
          }}
        />
      )}

      <ErrorApi error={inventario.error} />

      <div className="grid items-start gap-6 xl:grid-cols-3">
        <div className={puedeIngresar ? 'xl:col-span-2' : 'xl:col-span-3'}>
          <TablaMaderas
            maderas={maderas}
            onEditar={esAdmin ? setMaderaEnEdicion : undefined}
            incluirInactivas={incluirInactivas}
            onIncluirInactivas={esAdmin ? setIncluirInactivas : undefined}
          />
        </div>

        {puedeIngresar && (
          <Tarjeta
            titulo={esAdmin ? undefined : 'Ingreso de troca'}
            acciones={
              esAdmin && (
                <div className="flex w-full rounded-md border border-stone-300 p-0.5" role="tablist">
                  {OPERACIONES.map((op) => (
                    <button
                      key={op.valor}
                      type="button"
                      role="tab"
                      aria-selected={operacion === op.valor}
                      onClick={() => setOperacion(op.valor)}
                      className={`flex-1 rounded px-3 py-1.5 text-sm ${operacion === op.valor ? 'bg-primary text-surface' : 'text-stone-700'}`}
                    >
                      {op.texto}
                    </button>
                  ))}
                </div>
              )
            }
          >
            {operacion === 'ajuste' && esAdmin ? (
              <FormAjuste maderas={maderas ?? []} onRegistrado={recargar} />
            ) : (
              <FormIngresoTroca maderas={maderasActivas} onRegistrado={recargar} />
            )}
          </Tarjeta>
        )}
      </div>

      <TablaMovimientos resultado={movimientos} maderas={maderas ?? []} filtros={filtros} onFiltros={setFiltros} />
    </div>
  );
}
