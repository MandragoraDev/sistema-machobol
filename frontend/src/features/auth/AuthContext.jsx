import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { alNoAutorizado, api } from '../../api/client.js';
import { borrarToken, guardarToken, leerToken, usuarioDelToken } from './sesion.js';

const AuthContext = createContext(null);

function sesionInicial() {
  // Al recargar la página, el usuario y su rol salen del token guardado; luego se confirman con /auth/me.
  const usuario = usuarioDelToken(leerToken());
  if (!usuario) borrarToken();
  return { usuario, verificando: Boolean(usuario), aviso: null, cierreVoluntario: false };
}

export function AuthProvider({ children }) {
  const [sesion, setSesion] = useState(sesionInicial);

  // `cierreVoluntario`: tras "Cerrar sesión" el siguiente login va al Dashboard, no a la página donde estaba el anterior usuario.
  const terminarSesion = useCallback((aviso = null) => {
    borrarToken();
    setSesion({ usuario: null, verificando: false, aviso, cierreVoluntario: !aviso });
  }, []);

  useEffect(() => {
    alNoAutorizado(() => terminarSesion('Tu sesión expiró. Inicia sesión de nuevo.'));
  }, [terminarSesion]);

  useEffect(() => {
    if (!sesion.verificando) return;
    api('/auth/me')
      .then(({ usuario }) => setSesion({ usuario, verificando: false, aviso: null, cierreVoluntario: false }))
      .catch((err) => {
        // 401 ya cerró la sesión vía alNoAutorizado. Si la API no responde, se confía en el token hasta el próximo intento.
        if (err.status !== 401) setSesion((actual) => ({ ...actual, verificando: false }));
      });
  }, [sesion.verificando]);

  const iniciarSesion = useCallback(async (email, password) => {
    const { token, usuario } = await api('/auth/login', { method: 'POST', body: { email, password } });
    guardarToken(token);
    // El rol que gobierna el menú y el Dashboard se lee del propio token.
    setSesion({ usuario: { ...usuario, ...usuarioDelToken(token) }, verificando: false, aviso: null, cierreVoluntario: false });
  }, []);

  const cerrarSesion = useCallback(() => terminarSesion(), [terminarSesion]);

  const valor = useMemo(
    () => ({ ...sesion, iniciarSesion, cerrarSesion }),
    [sesion, iniciarSesion, cerrarSesion],
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
