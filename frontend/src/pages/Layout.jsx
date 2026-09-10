import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWallet, formatCents } from '../context/WalletContext';

export default function Layout() {
  const { user, logout } = useAuth();
  const { balanceCents } = useWallet();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">Palco</div>

        <nav className="nav">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
            Deportes
          </NavLink>
          <NavLink to="/casino" className={({ isActive }) => (isActive ? 'active' : '')}>
            Casino
          </NavLink>
          <NavLink to="/wallet" className={({ isActive }) => (isActive ? 'active' : '')}>
            Billetera
          </NavLink>
          {user?.role === 'admin' && (
            <NavLink to="/admin" className={({ isActive }) => (isActive ? 'active' : '')}>
              Admin
            </NavLink>
          )}
        </nav>

        <div className="sidebar-wallet">
          <div className="label text-sage">{user?.full_name || user?.email}</div>
          <div className="amount-row">
            <svg className="chip-icon" width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="var(--gold)" strokeWidth="1.5" />
              <circle cx="12" cy="12" r="5.5" stroke="var(--gold)" strokeWidth="1.5" />
              <path
                d="M12 2v3.2M12 18.8V22M22 12h-3.2M5.2 12H2M19.07 4.93l-2.26 2.26M7.19 16.81l-2.26 2.26M19.07 19.07l-2.26-2.26M7.19 7.19L4.93 4.93"
                stroke="var(--gold)"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <span className="amount">{formatCents(balanceCents)}</span>
          </div>
          <button className="btn-ghost" style={{ marginTop: 14, width: '100%' }} onClick={handleLogout}>
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
