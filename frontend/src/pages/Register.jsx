import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AuthHero } from '../components/AuthHero';

const MIN_PASSWORD_LENGTH = 8;

function passwordChecks(password) {
  return {
    length: password.length >= MIN_PASSWORD_LENGTH,
    letter: /[A-Za-z]/.test(password),
    number: /[0-9]/.test(password),
  };
}

function PasswordRequirements({ password, touched }) {
  const checks = passwordChecks(password);
  const items = [
    [checks.length, `Al menos ${MIN_PASSWORD_LENGTH} caracteres`],
    [checks.letter, 'Al menos una letra'],
    [checks.number, 'Al menos un número'],
  ];
  return (
    <ul className="password-requirements">
      {items.map(([met, label]) => (
        <li key={label} className={met ? 'met' : touched ? 'unmet' : ''}>
          <span className="password-requirements-mark">{met ? '✓' : '·'}</span>
          {label}
        </li>
      ))}
    </ul>
  );
}

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: '', email: '', password: '', birthDate: '' });
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  const checks = passwordChecks(form.password);
  const passwordValid = checks.length && checks.letter && checks.number;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!passwordValid) {
      setPasswordTouched(true);
      setError('La contraseña no cumple los requisitos de abajo.');
      return;
    }
    setSubmitting(true);
    try {
      await register(form);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <AuthHero />
        <div className="brand">Palco</div>
        <p className="tagline">Crea tu cuenta. Debes ser mayor de 18 años.</p>

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="fullName">Nombre completo</label>
            <input id="fullName" value={form.fullName} onChange={update('fullName')} required />
          </div>
          <div className="field">
            <label htmlFor="birthDate">Fecha de nacimiento</label>
            <input
              id="birthDate"
              type="date"
              value={form.birthDate}
              onChange={update('birthDate')}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="email">Correo</label>
            <input id="email" type="email" value={form.email} onChange={update('email')} required />
          </div>
          <div className="field">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              value={form.password}
              onChange={update('password')}
              onBlur={() => setPasswordTouched(true)}
              minLength={MIN_PASSWORD_LENGTH}
              required
            />
            <PasswordRequirements password={form.password} touched={passwordTouched} />
          </div>
          <button className="btn" type="submit" disabled={submitting} style={{ width: '100%' }}>
            {submitting ? 'Creando cuenta…' : 'Crear cuenta'}
          </button>
        </form>

        <p className="text-sage" style={{ marginTop: 20, fontSize: 14 }}>
          ¿Ya tienes cuenta? <Link to="/login" className="text-gold">Ingresa</Link>
        </p>
      </div>
    </div>
  );
}
