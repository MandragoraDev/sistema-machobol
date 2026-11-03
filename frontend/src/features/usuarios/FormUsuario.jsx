import { useState } from 'react';
import { api } from '../../api/client.js';
import { Boton, Campo, ErrorApi, Tarjeta, claseInput } from '../../components/ui.jsx';
import { ETIQUETA_ROL } from '../../utils/formato.js';

/** Alta o edición de un usuario. Al editarse a sí mismo, el Admin no puede cambiar su rol ni desactivarse. */
export default function FormUsuario({ usuario, esUnoMismo, onGuardado, onCancelar }) {
  const editando = Boolean(usuario);
  const [form, setForm] = useState({
    nombre: usuario?.nombre ?? '',
    email: usuario?.email ?? '',
    rol: usuario?.rol ?? 'VENTAS',
    activo: usuario?.activo ?? true,
    password: '',
  });
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const cambiar = (campo) => (evento) => setForm((actual) => ({ ...actual, [campo]: evento.target.value }));

  async function enviar(evento) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    const body = { nombre: form.nombre.trim(), email: form.email.trim() };
    if (!esUnoMismo) {
      body.rol = form.rol;
      if (editando) body.activo = form.activo;
    }
    if (form.password) body.password = form.password;

    try {
      await api(editando ? `/usuarios/${usuario.id}` : '/usuarios', { method: editando ? 'PATCH' : 'POST', body });
      onGuardado();
    } catch (err) {
      setError(err);
      setEnviando(false);
    }
  }

  return (
    <Tarjeta titulo={editando ? `Editar a ${usuario.nombre}` : 'Nuevo usuario'}>
      <form onSubmit={enviar} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo etiqueta="Nombre completo">
            <input type="text" required minLength={2} maxLength={120}
              value={form.nombre} onChange={cambiar('nombre')} className={claseInput} />
          </Campo>
          <Campo etiqueta="Correo electrónico">
            <input type="email" required maxLength={160} autoComplete="off"
              value={form.email} onChange={cambiar('email')} className={claseInput} />
          </Campo>
          <Campo etiqueta="Rol" ayuda={esUnoMismo ? 'No puedes cambiar tu propio rol.' : undefined}>
            <select value={form.rol} onChange={cambiar('rol')} disabled={esUnoMismo} className={claseInput}>
              {Object.entries(ETIQUETA_ROL).map(([valor, texto]) => (
                <option key={valor} value={valor}>{texto}</option>
              ))}
            </select>
          </Campo>
          <Campo
            etiqueta={editando ? 'Nueva contraseña (opcional)' : 'Contraseña'}
            ayuda={editando ? 'Déjala vacía para no cambiarla. Mínimo 8 caracteres.' : 'Mínimo 8 caracteres.'}
          >
            <input type="password" required={!editando} minLength={8} maxLength={72} autoComplete="new-password"
              value={form.password} onChange={cambiar('password')} className={claseInput} />
          </Campo>
        </div>

        {editando && !esUnoMismo && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.activo}
              onChange={(e) => setForm((actual) => ({ ...actual, activo: e.target.checked }))} />
            Cuenta activa (si la desactivas, la sesión del usuario se corta de inmediato)
          </label>
        )}

        <ErrorApi error={error} />

        <div className="flex gap-2">
          <Boton type="submit" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar'}</Boton>
          <Boton variante="secundario" onClick={onCancelar}>Cancelar</Boton>
        </div>
      </form>
    </Tarjeta>
  );
}
