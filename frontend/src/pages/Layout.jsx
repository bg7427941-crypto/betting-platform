import { NavLink, Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useWallet, formatCents } from '../context/WalletContext';
import { useTheme } from '../context/ThemeContext';
import Icon from '../components/Icon';

const links = [
  { to: '/', label: 'Deportes', icon: 'sports' },
  { to: '/casino', label: 'Casino', icon: 'casino' },
  { to: '/wallet', label: 'Billetera', icon: 'wallet' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { balanceCents, error, refresh } = useWallet();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const navigation =
    user?.role === 'admin'
      ? [...links, { to: '/admin', label: 'Administración', icon: 'admin' }]
      : links;
  const section = navigation.find((link) => link.to === location.pathname)?.label || 'Palco';
  const name = user?.full_name || user?.email || 'Mi cuenta';

  useEffect(() => {
    document.title = `${section} · Palco`;
    window.scrollTo(0, 0);
    document.getElementById('main-content')?.focus({ preventScroll: true });
  }, [location.pathname, section]);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="shell">
      <a className="skip-link" href="#main-content">
        Ir al contenido
      </a>
      <aside className="sidebar">
        <Link className="brand sidebar-brand" to="/">
          palco<span>.</span>
        </Link>
        <div className="sidebar-section-label">EXPLORA PALCO</div>
        <nav
          className={`nav${user?.role === 'admin' ? ' nav-admin' : ''}`}
          aria-label="Navegación principal"
        >
          {navigation.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === '/'}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              <Icon name={link.icon} />
              <span>{link.label}</span>
              {link.to === '/casino' && <span className="nav-tag">4 juegos</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-demo">
            <Icon name="shield" />
            <div>
              <strong>Tu espacio de práctica</strong>
              <p>
                Saldo virtual.
                <br />
                La experiencia, a tu ritmo.
              </p>
            </div>
          </div>
          <div className="sidebar-account">
            <span className="user-avatar">{name.charAt(0).toUpperCase()}</span>
            <div>
              <strong>{name}</strong>
              <span>{user?.role === 'admin' ? 'Administrador' : 'Cuenta demo'}</span>
            </div>
          </div>
          <button className="logout-button" onClick={handleLogout}>
            <Icon name="logout" size={18} /> Cerrar sesión
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="shell-header">
          <Link className="brand mobile-brand" to="/">
            palco<span>.</span>
          </Link>
          <div className="header-section">
            <span>PALCO /</span> {section}
          </div>
          <div className="header-actions">
            <Link
              to="/wallet"
              className="header-balance"
              aria-label={`Ir a billetera. Saldo virtual: ${error ? 'no disponible' : formatCents(balanceCents)}`}
            >
              <Icon name="wallet" />
              <div>
                <span>Saldo virtual</span>
                <strong>{error ? 'No disponible' : formatCents(balanceCents)}</strong>
              </div>
            </Link>
            <Link to="/wallet" className="btn header-deposit">
              <Icon name="plus" size={16} /> Agregar saldo
            </Link>
            <button
              className="icon-button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
            </button>
            <button
              className="icon-button mobile-logout"
              onClick={handleLogout}
              aria-label="Cerrar sesión"
            >
              <Icon name="logout" />
            </button>
          </div>
        </header>
        <main className="page-content" id="main-content" tabIndex={-1}>
          {error && (
            <div className="error-banner" role="alert">
              No pudimos actualizar tu saldo.{' '}
              <button className="link-btn" onClick={() => refresh().catch(() => {})}>
                Reintentar
              </button>
            </div>
          )}
          <Outlet />
        </main>
        <footer className="shell-footer">
          <span className="brand">
            palco<span>.</span>
          </span>
          <span>Modo demo · Todos los saldos son virtuales.</span>
          <span>18+ · Juega a tu ritmo</span>
        </footer>
      </div>
    </div>
  );
}
