import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthFrame from '../components/AuthFrame';
import PasswordField from '../components/PasswordField';
import Icon from '../components/Icon';

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
    <ul className="password-requirements" id="password-requirements">
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
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    birthDate: '',
  });
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
    <AuthFrame
      title="Tu experiencia empieza aquí."
      description="Crea una cuenta para explorar Palco con saldo virtual."
    >
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} aria-busy={submitting}>
        <div className="field">
          <label htmlFor="fullName">Nombre completo</label>
          <input
            id="fullName"
            autoComplete="name"
            placeholder="Como aparece en tu documento"
            value={form.fullName}
            onChange={update('fullName')}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="birthDate">Fecha de nacimiento</label>
          <input
            id="birthDate"
            type="date"
            autoComplete="bday"
            max={new Date().toLocaleDateString('en-CA')}
            aria-describedby="birthdate-hint"
            value={form.birthDate}
            onChange={update('birthDate')}
            required
          />
          <span className="input-note" id="birthdate-hint">
            Debes tener al menos 18 años para crear una cuenta.
          </span>
        </div>
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
            value={form.email}
            onChange={update('email')}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="password">Contraseña</label>
          <PasswordField
            id="password"
            autoComplete="new-password"
            placeholder="Crea una contraseña"
            aria-describedby="password-requirements"
            value={form.password}
            onChange={update('password')}
            onBlur={() => setPasswordTouched(true)}
            minLength={MIN_PASSWORD_LENGTH}
            required
          />
          <PasswordRequirements password={form.password} touched={passwordTouched} />
        </div>
        <button className="btn" type="submit" disabled={submitting} style={{ width: '100%' }}>
          {submitting ? (
            'Creando cuenta…'
          ) : (
            <>
              Crear cuenta <Icon name="arrow" size={18} />
            </>
          )}
        </button>
      </form>

      <p className="auth-switch">
        ¿Ya tienes cuenta?{' '}
        <Link to="/login" className="text-gold">
          Ingresa
        </Link>
      </p>
    </AuthFrame>
  );
}
