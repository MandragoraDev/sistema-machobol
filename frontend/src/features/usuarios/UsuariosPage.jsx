import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { useApi } from '../../hooks/useApi.js';
import { Boton, EncabezadoPagina, ErrorApi, Insignia, Tarjeta } from '../../components/ui.jsx';
import { ETIQUETA_ROL } from '../../utils/formato.js';
import FormUsuario from './FormUsuario.jsx';

export default function UsuariosPage() {
  const { usuario: yo } = useAuth();
  const usuarios = useApi('/usuarios');
  const [enEdicion, setEnEdicion] = useState(null); // null | 'nuevo' | usuario

  return (
    <div className="max-w-5xl space-y-6">
      <EncabezadoPagina
        titulo="Usuarios"
        descripcion="Personal con acceso al panel. Cada rol ve un Dashboard y unas acciones distintas."
        acciones={!enEdicion && <Boton onClick={() => setEnEdicion('nuevo')}>Nuevo usuario</Boton>}
      />

      {enEdicion && (
        <FormUsuario
          key={enEdicion === 'nuevo' ? 'nuevo' : enEdicion.id}
          usuario={enEdicion === 'nuevo' ? null : enEdicion}
          esUnoMismo={enEdicion !== 'nuevo' && enEdicion.id === yo.id}
          onCancelar={() => setEnEdicion(null)}
          onGuardado={() => {
            setEnEdicion(null);
            usuarios.recargar();
          }}
        />
      )}

      <ErrorApi error={usuarios.error} />

      <Tarjeta>
        {!usuarios.datos ? (
          <p className="text-sm text-stone-500">Cargando…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="py-2 pr-4 font-medium">Nombre</th>
                  <th className="py-2 pr-4 font-medium">Correo</th>
                  <th className="py-2 pr-4 font-medium">Rol</th>
                  <th className="py-2 pr-4 font-medium">Estado</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {usuarios.datos.map((u) => (
                  <tr key={u.id} className={u.activo ? '' : 'text-stone-400'}>
                    <td className="py-3 pr-4 font-medium">
                      {u.nombre}
                      {u.id === yo.id && <span className="ml-2 text-xs font-normal text-stone-500">(tú)</span>}
                    </td>
                    <td className="py-3 pr-4">{u.email}</td>
                    <td className="py-3 pr-4"><Insignia tono="primario">{ETIQUETA_ROL[u.rol]}</Insignia></td>
                    <td className="py-3 pr-4">
                      <Insignia tono={u.activo ? 'exito' : 'neutro'}>{u.activo ? 'Activo' : 'Inactivo'}</Insignia>
                    </td>
                    <td className="py-3 text-right">
                      <button type="button" onClick={() => setEnEdicion(u)} className="text-sm text-primary underline-offset-2 hover:underline">
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
    </div>
  );
}
