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

// Deben coincidir con MIN_DEPOSIT_CENTS / MIN_WITHDRAW_CENTS en
// wallet.service.js — son solo para mostrar el hint antes de que el
// usuario mande la request; el backend valida igual del lado del servidor.
const MIN_DEPOSIT_CENTS = 500;
const MIN_WITHDRAW_CENTS = 1000;

export default function Wallet() {
  const { balanceCents, refresh } = useWallet();
  const [amount, setAmount] = useState('20');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState([]);
  const [details, setDetails] = useState(null);

  useEffect(() => {
    loadHistory();
    loadDetails();
  }, []);

  async function loadHistory() {
    try {
      const data = await api.walletHistory();
      setHistory(data);
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadDetails() {
    try {
      const wallet = await api.getWallet();
      setDetails(wallet);
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
      await loadDetails();
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
      await loadDetails();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const amountCents = Math.round(Number(amount || 0) * 100);
  const belowDepositMin = amountCents > 0 && amountCents < MIN_DEPOSIT_CENTS;
  const belowWithdrawMin = amountCents > 0 && amountCents < MIN_WITHDRAW_CENTS;

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

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn" onClick={handleDeposit} disabled={busy || belowDepositMin}>
            Depositar
          </button>
          <button className="btn-ghost" onClick={handleWithdraw} disabled={busy || belowWithdrawMin}>
            Retirar
          </button>
        </div>
        <div className="text-sage" style={{ fontSize: 12, marginTop: 8 }}>
          Depósito mínimo {formatCents(MIN_DEPOSIT_CENTS)} · Retiro mínimo {formatCents(MIN_WITHDRAW_CENTS)}
        </div>
      </div>

      {details && <DepositLimitPanel details={details} onChanged={loadDetails} />}

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

/**
 * Límite de depósito diario, autoimpuesto. Bajarlo (o ponerlo por primera
 * vez) es inmediato; subirlo o quitarlo tarda 24h en aplicarse — así un
 * impulso a mitad de una mala racha no puede saltarse el límite que uno
 * mismo se puso en frío. Es protección, no fricción para vender más.
 */
function DepositLimitPanel({ details, onChanged }) {
  const [newLimit, setNewLimit] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const hasLimit = details.daily_deposit_limit_cents != null;

  async function applyLimit(cents) {
    setBusy(true);
    setMessage('');
    try {
      const result = await api.setDepositLimit(cents);
      if (result.pending_deposit_limit_effective_at) {
        const when = new Date(result.pending_deposit_limit_effective_at);
        setMessage(
          cents === null
            ? `Vas a quitar el límite — se aplica el ${when.toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })}.`
            : `Nuevo límite en camino — se aplica el ${when.toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })}.`
        );
      } else {
        setMessage(cents === null ? 'Límite quitado.' : 'Límite actualizado.');
      }
      setNewLimit('');
      await onChanged();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  }

  const progressPct =
    hasLimit && details.daily_deposit_limit_cents > 0
      ? Math.min(100, (details.deposited_today_cents / details.daily_deposit_limit_cents) * 100)
      : 0;

  return (
    <div className="panel" style={{ maxWidth: 420, marginTop: 18 }}>
      <div className="text-sage" style={{ fontSize: 13, marginBottom: 6 }}>Límite de depósito diario</div>

      {hasLimit ? (
        <>
          <div className="mono" style={{ fontSize: 20, marginBottom: 6 }}>
            {formatCents(details.deposited_today_cents)} de {formatCents(details.daily_deposit_limit_cents)} hoy
          </div>
          <div className="rating-bar-track" style={{ marginBottom: 10 }}>
            <div className="rating-bar-fill" style={{ width: `${progressPct}%` }} />
          </div>
        </>
      ) : (
        <div className="text-sage" style={{ fontSize: 13, marginBottom: 10 }}>Sin límite fijado.</div>
      )}

      {details.pending_deposit_limit_effective_at && (
        <div className="text-gold" style={{ fontSize: 12, marginBottom: 10 }}>
          Cambio pendiente: {details.pending_deposit_limit_cents === null ? 'quitar límite' : `pasar a ${formatCents(details.pending_deposit_limit_cents)}`}{' '}
          el {new Date(details.pending_deposit_limit_effective_at).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="field" style={{ maxWidth: 150, marginBottom: 0 }}>
          <label htmlFor="deposit-limit">Nuevo límite (PEN)</label>
          <input
            id="deposit-limit"
            type="number"
            min="1"
            value={newLimit}
            onChange={(e) => setNewLimit(e.target.value)}
            placeholder="ej. 200"
          />
        </div>
        <button
          className="btn-ghost"
          disabled={busy || !newLimit}
          onClick={() => applyLimit(Math.round(Number(newLimit) * 100))}
        >
          Fijar límite
        </button>
        {hasLimit && (
          <button className="btn-ghost" disabled={busy} onClick={() => applyLimit(null)}>
            Quitar límite
          </button>
        )}
      </div>
      {message && <div className="text-sage" style={{ fontSize: 12, marginTop: 8 }}>{message}</div>}
      <div className="text-sage" style={{ fontSize: 11, marginTop: 10, opacity: 0.75 }}>
        Bajar el límite es inmediato. Subirlo o quitarlo tarda 24h en aplicarse.
      </div>
    </div>
  );
}
