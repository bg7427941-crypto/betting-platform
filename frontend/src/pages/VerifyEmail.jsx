import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AuthHero } from '../components/AuthHero';
import { api } from '../api/client';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [status, setStatus] = useState(token ? 'loading' : 'error'); // loading | ok | error
  const [message, setMessage] = useState(token ? '' : 'El enlace de verificación es inválido.');
  // React.StrictMode ejecuta los efectos dos veces en desarrollo; el token es de un
  // solo uso, así que sin este guard la segunda llamada marcaría error.
  const called = useRef(false);

  useEffect(() => {
    if (!token || called.current) return;
    called.current = true;
    api
      .verifyEmail(token)
      .then(() => setStatus('ok'))
      .catch((err) => {
        setStatus('error');
        setMessage(err.message);
      });
  }, [token]);

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <AuthHero />
        <div className="brand">Palco</div>
        {status === 'loading' && <p className="tagline">Verificando tu correo…</p>}
        {status === 'ok' && (
          <>
            <p className="tagline">¡Correo verificado!</p>
            <p className="text-sage" style={{ fontSize: 14 }}>Tu cuenta ya está activa.</p>
            <Link to="/login" className="btn" style={{ display: 'block', textAlign: 'center', marginTop: 16 }}>
              Iniciar sesión
            </Link>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="error-banner">{message}</div>
            <p className="text-sage" style={{ fontSize: 14 }}>
              Inicia sesión con tu correo y contraseña para pedir un enlace nuevo.
            </p>
            <Link to="/login" className="text-gold">Ir a iniciar sesión</Link>
          </>
        )}
      </div>
    </div>
  );
}
