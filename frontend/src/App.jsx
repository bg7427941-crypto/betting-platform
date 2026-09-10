import { Navigate, Route, Routes } from 'react-router-dom';
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
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

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
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
        <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />

        <Route path="/" element={<PrivateArea />}>
          <Route index element={<Sportsbook />} />
          <Route path="casino" element={<Casino />} />
          <Route path="wallet" element={<Wallet />} />
          <Route path="admin" element={<RequireAdmin><Admin /></RequireAdmin>} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
