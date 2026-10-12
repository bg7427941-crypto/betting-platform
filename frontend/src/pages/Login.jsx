import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthFrame from '../components/AuthFrame';
import PasswordField from '../components/PasswordField';
import Icon from '../components/Icon';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthFrame
      title="Qué bueno verte."
      description="Ingresa a tu cuenta y continúa donde lo dejaste."
    >
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} aria-busy={submitting}>
        <div className="field">
          <label htmlFor="email">Correo</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="tu@correo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">Contraseña</label>
          <PasswordField
            id="password"
            autoComplete="current-password"
            placeholder="Tu contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button className="btn" type="submit" disabled={submitting} style={{ width: '100%' }}>
          {submitting ? (
            'Ingresando…'
          ) : (
            <>
              Ingresar <Icon name="arrow" size={18} />
            </>
          )}
        </button>
      </form>

      <p className="auth-switch">
        ¿No tienes cuenta?{' '}
        <Link to="/register" className="text-gold">
          Regístrate
        </Link>
      </p>
      <div className="auth-note">
        <Icon name="shield" size={18} /> Tu cuenta de práctica usa únicamente saldo virtual.
      </div>
    </AuthFrame>
  );
}
