import { useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from './AuthContext.jsx';
import { Alerta, Boton, Campo, claseInput } from '../../components/ui.jsx';

function Logo() {
  return (
    <svg viewBox="0 0 32 32" className="h-12 w-12" aria-hidden="true">
      <rect width="32" height="32" rx="6" fill="#4E342E" />
      <path d="M8 23V9h3l5 7 5-7h3v14h-3v-9l-5 7-5-7v9z" fill="#F5EEDC" />
    </svg>
  );
}

export default function LoginPage() {
  const { usuario, iniciarSesion, aviso } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  if (usuario) {
    return <Navigate to={location.state?.desde || '/dashboard'} replace />;
  }

  async function enviar(evento) {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await iniciarSesion(email, password);
    } catch (err) {
      setError(err.status && err.status < 500 ? err.message : 'No se pudo conectar con el servidor. Intenta de nuevo.');
      setEnviando(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo />
          <p className="mt-3 text-2xl font-bold tracking-widest text-primary">MACHOBOL</p>
          <p className="text-sm text-stone-600">Sistema de gestión · Portones y parques infantiles</p>
        </div>

        <form onSubmit={enviar} className="space-y-4 rounded-xl border border-primary/15 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-primary">Iniciar sesión</h1>
          {aviso && <Alerta tipo="info">{aviso}</Alerta>}
          {error && <Alerta tipo="error">{error}</Alerta>}

          <Campo etiqueta="Correo electrónico">
            <input
              type="email"
              autoComplete="username"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={claseInput}
            />
          </Campo>
          <Campo etiqueta="Contraseña">
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={claseInput}
            />
          </Campo>

          <Boton type="submit" disabled={enviando} className="w-full">
            {enviando ? 'Ingresando…' : 'Ingresar'}
          </Boton>
        </form>
      </div>
    </main>
  );
}
