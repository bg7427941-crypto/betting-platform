import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useWallet, formatCents } from '../context/WalletContext';

const TYPE_LABELS = {
  deposit: 'Depósito',
  withdraw: 'Retiro',
  bet_stake: 'Apuesta',
  bet_payout: 'Pago de apuesta',
  adjustment: 'Ajuste',
};

export default function Wallet() {
  const { balanceCents, refresh } = useWallet();
  const [amount, setAmount] = useState('20');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);

  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory() {
    try {
      const data = await api.walletHistory();
      setHistory(data);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDeposit() {
    setBusy(true);
    setError('');
    try {
      await api.deposit(Math.round(Number(amount) * 100));
      await refresh();
      await loadHistory();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleWithdraw() {
    setBusy(true);
    setError('');
    try {
      await api.withdraw(Math.round(Number(amount) * 100));
      await refresh();
      await loadHistory();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="page-title">Billetera</h1>
      <p className="page-sub">
        Saldo virtual — modo demo, sin dinero real todavía.
      </p>

      <div className="panel" style={{ maxWidth: 420 }}>
        <div className="text-sage" style={{ fontSize: 13 }}>Saldo actual</div>
        <div className="mono" style={{ fontSize: 34, marginBottom: 18 }}>
          {formatCents(balanceCents)}
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="field" style={{ maxWidth: 180 }}>
          <label htmlFor="amount">Monto (PEN)</label>
          <input id="amount" type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn" onClick={handleDeposit} disabled={busy}>
            Depositar
          </button>
          <button className="btn-ghost" onClick={handleWithdraw} disabled={busy}>
            Retirar
          </button>
        </div>
      </div>

      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, margin: '32px 0 14px' }}>
        Historial
      </h2>

      {history.length === 0 && <div className="empty-state">Todavía no hay movimientos.</div>}

      {history.map((tx) => (
        <div className="ticket" key={tx.id} style={{ marginBottom: 8 }}>
          <div>
            <div>{TYPE_LABELS[tx.type] || tx.type}</div>
            <div className="text-sage" style={{ fontSize: 12 }}>
              {new Date(tx.created_at).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })}
            </div>
          </div>
          <div className={`mono ${Number(tx.amount_cents) >= 0 ? 'text-gold' : 'text-brick'}`}>
            {Number(tx.amount_cents) >= 0 ? '+' : ''}
            {formatCents(tx.amount_cents)}
          </div>
        </div>
      ))}
    </div>
  );
}
