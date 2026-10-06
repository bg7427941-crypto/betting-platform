import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useWallet, formatCents } from '../context/WalletContext';
import { useNotice } from '../lib/useNotice';
import QuickAmounts from '../components/QuickAmounts';

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
  const [notice, setNotice] = useNotice();
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');

  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory() {
    setHistoryError('');
    try {
      const data = await api.walletHistory();
      setHistory(data);
    } catch (err) {
      setHistoryError(err.message);
    } finally {
      setHistoryLoading(false);
    }
  }

  const amountValue = Number(amount);
  const amountCents = Math.round(amountValue * 100);
  const amountInvalid = amount === '' || !Number.isFinite(amountValue) || amountCents < 100;
  const overBalance = balanceCents !== null && !amountInvalid && amountCents > balanceCents;

  async function run(kind) {
    if (amountInvalid || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (kind === 'deposit') {
        await api.deposit(amountCents);
        setNotice(`Depósito realizado: +${formatCents(amountCents)}.`);
      } else {
        await api.withdraw(amountCents);
        setNotice(`Retiro realizado: −${formatCents(amountCents)}.`);
      }
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

        {error && (
          <div className="error-banner" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="success-banner" role="status">
            {notice}
          </div>
        )}

        <div className="field" style={{ maxWidth: 180 }}>
          <label htmlFor="amount">Monto (PEN)</label>
          <input
            id="amount"
            type="number"
            inputMode="decimal"
            min="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={amountInvalid}
            aria-describedby="amount-hint"
          />
        </div>

        <QuickAmounts value={amount} onPick={setAmount} disabled={busy} />

        <div id="amount-hint" aria-live="polite">
          {amountInvalid && <div className="field-hint is-error">Ingresa un monto de al menos S/ 1.</div>}
          {overBalance && (
            <div className="field-hint">
              Supera tu saldo: puedes depositar, pero solo retirar hasta {formatCents(balanceCents)}.
            </div>
          )}
        </div>

        <div className="wallet-actions">
          <button className="btn" onClick={() => run('deposit')} disabled={busy || amountInvalid}>
            {busy ? 'Procesando…' : 'Depositar'}
          </button>
          <button
            className="btn-ghost"
            onClick={() => run('withdraw')}
            disabled={busy || amountInvalid || overBalance}
          >
            Retirar
          </button>
        </div>
      </div>

      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, margin: '32px 0 14px' }}>
        Historial
      </h2>

      {historyError && (
        <div className="error-banner" role="alert">
          No pudimos cargar el historial ({historyError}).{' '}
          <button className="link-btn" onClick={loadHistory}>
            Reintentar
          </button>
        </div>
      )}

      {historyLoading && (
        <div className="empty-state" role="status">
          Cargando movimientos…
        </div>
      )}

      {!historyLoading && !historyError && history.length === 0 && (
        <div className="empty-state">Todavía no hay movimientos. Haz tu primer depósito arriba.</div>
      )}

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