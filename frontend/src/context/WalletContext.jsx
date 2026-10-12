import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from './AuthContext';

const WalletContext = createContext(null);

export function WalletProvider({ children }) {
  const { user } = useAuth();
  const [balanceCents, setBalanceCents] = useState(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const wallet = await api.getWallet();
      setBalanceCents(Number(wallet.balance_cents));
      setError('');
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [user]);

  useEffect(() => {
    if (user) refresh().catch(() => {});
    else setBalanceCents(null);
  }, [user, refresh]);

  return (
    <WalletContext.Provider value={{ balanceCents, refresh, error }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}

export function formatCents(cents, currency = 'PEN') {
  if (cents === null || cents === undefined) return '—';
  const value = cents / 100;
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency }).format(value);
}
