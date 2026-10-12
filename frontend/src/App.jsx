import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { WalletProvider } from './context/WalletContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Layout from './pages/Layout';
import Sportsbook from './pages/Sportsbook';
import Casino from './pages/Casino';
import Wallet from './pages/Wallet';
import Admin from './pages/Admin';

function PrivateArea() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <AppLoading />;
  if (!user)
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;

  return (
    <WalletProvider>
      <Layout />
    </WalletProvider>
  );
}

function RequireAdmin({ children }) {
  const { user } = useAuth();
  if (user?.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <AppLoading />;
  if (user) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route
          path="/login"
          element={
            <PublicOnly>
              <Login />
            </PublicOnly>
          }
        />
        <Route
          path="/register"
          element={
            <PublicOnly>
              <Register />
            </PublicOnly>
          }
        />

        <Route path="/" element={<PrivateArea />}>
          <Route index element={<Sportsbook />} />
          <Route path="casino" element={<Casino />} />
          <Route path="wallet" element={<Wallet />} />
          <Route
            path="admin"
            element={
              <RequireAdmin>
                <Admin />
              </RequireAdmin>
            }
          />
          <Route
            path="*"
            element={
              <div className="empty-card">
                <h1>Página no encontrada</h1>
                <p>Vuelve a explorar los eventos o visita tu billetera.</p>
                <Link className="btn" to="/">
                  Ir a Deportes
                </Link>
              </div>
            }
          />
        </Route>
      </Routes>
    </AuthProvider>
  );
}

function AppLoading() {
  return (
    <div className="app-loading" role="status">
      <span className="brand">palco.</span>
      <span>Cargando tu experiencia…</span>
    </div>
  );
}
