import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { AuthHero } from '../components/AuthHero';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendMsg, setResendMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setResendMsg('');
    setNeedsVerification(false);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.message);
      setNeedsVerification(err.code === 'EMAIL_NOT_VERIFIED');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setResendMsg('');
    try {
      const res = await api.resendVerification(email);
      setResendMsg(res.message);
    } catch (err) {
      setResendMsg(err.message);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <AuthHero />
        <div className="brand">Palco</div>
        <p className="tagline">Apuestas deportivas y casino, en un solo lugar.</p>

        {error && <div className="error-banner">{error}</div>}
        {needsVerification && (
          <div style={{ marginBottom: 16 }}>
            <button type="button" className="btn-ghost" style={{ width: '100%' }} onClick={handleResend}>
              Reenviar correo de verificación
            </button>
            {resendMsg && <p className="text-sage" style={{ marginTop: 10, fontSize: 14 }}>{resendMsg}</p>}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">Correo</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button className="btn" type="submit" disabled={submitting} style={{ width: '100%' }}>
            {submitting ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>

        <p className="text-sage" style={{ marginTop: 20, fontSize: 14 }}>
          ¿No tienes cuenta? <Link to="/register" className="text-gold">Regístrate</Link>
        </p>
      </div>
    </div>
  );
}
