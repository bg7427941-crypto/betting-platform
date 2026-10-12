import { Link } from 'react-router-dom';
import { AuthHero } from './AuthHero';
import Icon from './Icon';
import { useTheme } from '../context/ThemeContext';

export default function AuthFrame({ title, description, children }) {
  const { theme, toggleTheme } = useTheme();
  return (
    <main className="auth-layout">
      <section className="auth-story" aria-label="Acerca de Palco">
        <Link to="/login" className="brand auth-brand">
          palco<span>.</span>
        </Link>
        <div className="auth-story-content">
          <span className="eyebrow">TU LUGAR EN EL JUEGO</span>
          <h2>
            La emoción del juego.
            <br />
            <em>A tu manera.</em>
          </h2>
          <p>Deportes, mesas de casino y una experiencia para descubrir a tu ritmo.</p>
          <div className="auth-art">
            <AuthHero />
          </div>
          <div className="auth-features">
            <span>
              <Icon name="sports" /> Deportes
            </span>
            <span>
              <Icon name="casino" /> Casino
            </span>
            <span>
              <Icon name="wallet" /> Billetera
            </span>
          </div>
        </div>
        <p className="auth-disclaimer">
          <Icon name="shield" size={18} /> Solo mayores de 18 años · Saldo virtual, sin dinero real.
        </p>
      </section>
      <section className="auth-form-side">
        <div className="auth-form-toolbar">
          <Link to="/login" className="brand mobile-brand">
            palco<span>.</span>
          </Link>
          <span className="demo-pill">Modo demo</span>
          <button
            className="icon-button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
        </div>
        <div className="auth-card">
          <span className="eyebrow text-gold">BIENVENIDO A PALCO</span>
          <h1>{title}</h1>
          <p className="tagline">{description}</p>
          {children}
        </div>
        <p className="auth-form-footer">Una experiencia de práctica. Juega a tu ritmo.</p>
      </section>
    </main>
  );
}
