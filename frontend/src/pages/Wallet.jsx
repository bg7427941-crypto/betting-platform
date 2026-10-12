import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useWallet, formatCents } from '../context/WalletContext';
import { useNotice } from '../lib/useNotice';
import QuickAmounts from '../components/QuickAmounts';
import Icon from '../components/Icon';

const TYPE_LABELS = {
  deposit: 'Depósito',
  withdraw: 'Retiro',
  bet_stake: 'Apuesta',
  bet_payout: 'Pago de apuesta',
  adjustment: 'Ajuste',
};

export default function Wallet() {
  const { balanceCents, refresh, error: balanceError } = useWallet();
  const [amount, setAmount] = useState('20');
  const [mode, setMode] = useState('deposit');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useNotice();
  const [history, setHistory] = useState([]);
  const [filter, setFilter] = useState('all');
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');

  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory() {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      setHistory(await api.walletHistory());
    } catch (err) {
      setHistoryError(err.message);
    } finally {
      setHistoryLoading(false);
    }
  }

  const amountValue = Number(amount);
  const amountCents = Math.round(amountValue * 100);
  const amountInvalid =
    amount === '' ||
    !Number.isFinite(amountValue) ||
    !Number.isSafeInteger(amountCents) ||
    amountCents < 100;
  const overBalance = balanceCents !== null && !amountInvalid && amountCents > balanceCents;
  const canSubmit =
    !busy &&
    !balanceError &&
    !amountInvalid &&
    balanceCents !== null &&
    (mode === 'deposit' || !overBalance);
  const nextBalance =
    !balanceError &&
    !amountInvalid &&
    balanceCents !== null &&
    !(mode === 'withdraw' && overBalance)
      ? balanceCents + (mode === 'deposit' ? amountCents : -amountCents)
      : null;
  const filteredHistory = history.filter(
    (tx) =>
      filter === 'all' ||
      (filter === 'in' ? Number(tx.amount_cents) >= 0 : Number(tx.amount_cents) < 0)
  );

  async function run(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (mode === 'deposit') await api.deposit(amountCents);
      else await api.withdraw(amountCents);
      setNotice(
        `${mode === 'deposit' ? 'Depósito' : 'Retiro'} simulado realizado: ${formatCents(amountCents)}.`
      );
      await refresh().catch(() => {});
      await loadHistory();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="page-heading">
        <div>
          <span className="eyebrow">TODO BAJO CONTROL</span>
          <h1 className="page-title">Tu billetera</h1>
          <p className="page-sub">Consulta tu saldo y sigue cada movimiento, en un solo lugar.</p>
        </div>
        <span className="demo-pill">Saldo virtual</span>
      </div>
      <div className="wallet-grid">
        <div>
          <section className="wallet-balance-card" aria-label="Saldo de tu billetera">
            <div className="wallet-balance-label">
              <span>Saldo disponible</span>
              <Icon name="wallet" size={24} />
            </div>
            <div className="amount mono">
              {balanceError ? 'No disponible' : formatCents(balanceCents)}
            </div>
            <p>
              <Icon name="shield" size={14} /> PEN · Saldo virtual, sin dinero real
            </p>
          </section>
          <form className="panel wallet-operation" onSubmit={run} aria-busy={busy}>
            <div className="view-switch" role="group" aria-label="Tipo de operación">
              <button
                type="button"
                className={mode === 'deposit' ? 'btn' : 'btn-ghost'}
                aria-pressed={mode === 'deposit'}
                disabled={busy}
                onClick={() => {
                  setMode('deposit');
                  setError('');
                }}
              >
                <Icon name="down" size={16} /> Depositar
              </button>
              <button
                type="button"
                className={mode === 'withdraw' ? 'btn' : 'btn-ghost'}
                aria-pressed={mode === 'withdraw'}
                disabled={busy}
                onClick={() => {
                  setMode('withdraw');
                  setError('');
                }}
              >
                <Icon name="up" size={16} /> Retirar
              </button>
            </div>
            {error && (
              <div className="error-banner" role="alert">
                {error}
              </div>
            )}
            {notice && (
              <div className="success-banner" role="status">
                <Icon name="check" size={18} />
                {notice}
              </div>
            )}
            <div className="field">
              <label htmlFor="amount">
                {mode === 'deposit' ? '¿Cuánto quieres agregar?' : '¿Cuánto quieres retirar?'} (PEN)
              </label>
              <input
                id="amount"
                type="number"
                inputMode="decimal"
                min="1"
                step="0.01"
                value={amount}
                disabled={busy}
                onChange={(e) => setAmount(e.target.value)}
                aria-invalid={amountInvalid || (mode === 'withdraw' && overBalance)}
                aria-describedby="amount-hint"
                required
              />
            </div>
            <QuickAmounts value={amount} onPick={setAmount} disabled={busy} />
            <div id="amount-hint" aria-live="polite">
              {amountInvalid && (
                <div className="field-hint is-error">Ingresa un monto válido de al menos S/ 1.</div>
              )}
              {mode === 'withdraw' && overBalance && (
                <div className="field-hint is-error">
                  Tu saldo disponible es {formatCents(balanceCents)}. Ingresa un monto menor.
                </div>
              )}
              {balanceCents === null && (
                <div className="field-hint">
                  Espera a que tu saldo esté disponible para continuar.
                </div>
              )}
            </div>
            <div className="wallet-preview">
              <span>Saldo después de la operación</span>
              <strong>{formatCents(nextBalance)}</strong>
            </div>
            <button className="btn wallet-submit" type="submit" disabled={!canSubmit}>
              {busy ? (
                'Procesando…'
              ) : (
                <>
                  {mode === 'deposit' ? 'Confirmar depósito' : 'Confirmar retiro'}{' '}
                  <Icon name="arrow" size={17} />
                </>
              )}
            </button>
            <span className="input-note">Esta operación es simulada. No se mueve dinero real.</span>
          </form>
        </div>
        <section className="panel history-panel" aria-label="Historial de movimientos">
          <div className="history-heading">
            <h2>Movimientos</h2>
            <button
              className="icon-button"
              onClick={loadHistory}
              disabled={historyLoading}
              aria-label="Actualizar movimientos"
            >
              <Icon name="refresh" size={17} />
            </button>
          </div>
          <div className="history-filters" role="group" aria-label="Filtrar movimientos">
            {[
              ['all', 'Todos'],
              ['in', 'Entradas'],
              ['out', 'Salidas'],
            ].map(([value, label]) => (
              <button
                className={`filter-chip${filter === value ? ' active' : ''}`}
                key={value}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="section-caption">
            <span>Últimos 50 movimientos</span>
            <span role="status">
              {historyLoading
                ? 'Cargando…'
                : historyError
                  ? 'No disponibles'
                  : `${filteredHistory.length} ${filteredHistory.length === 1 ? 'movimiento' : 'movimientos'}`}
            </span>
          </div>
          {historyError && (
            <div className="error-banner" role="alert">
              No pudimos cargar tus movimientos.{' '}
              <button className="link-btn" onClick={loadHistory}>
                Reintentar
              </button>
            </div>
          )}
          {historyLoading && (
            <div className="skeleton-list" role="status" aria-label="Cargando movimientos">
              <div className="skeleton-card" />
              <div className="skeleton-card" />
            </div>
          )}
          {!historyLoading && !historyError && !filteredHistory.length && (
            <div className="empty-card">
              <Icon name="wallet" size={32} />
              <h3>{history.length ? 'Sin movimientos en esta categoría' : 'Un nuevo comienzo'}</h3>
              <p>
                {history.length
                  ? 'Prueba con Todos para ver el resto de tus movimientos.'
                  : 'Agrega saldo virtual para empezar. Cada operación aparecerá aquí.'}
              </p>
            </div>
          )}
          {!historyLoading &&
            !historyError &&
            filteredHistory.map((tx) => (
              <div className="transaction-row" key={tx.id}>
                <span className="transaction-icon">
                  <Icon name={Number(tx.amount_cents) >= 0 ? 'down' : 'up'} size={18} />
                </span>
                <div className="transaction-details">
                  <strong>{TYPE_LABELS[tx.type] || tx.type}</strong>
                  <span>
                    {new Date(tx.created_at).toLocaleString('es-PE', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                </div>
                <div
                  className={`transaction-amount mono ${Number(tx.amount_cents) >= 0 ? 'text-gold' : ''}`}
                >
                  {Number(tx.amount_cents) >= 0 ? '+' : '−'}
                  {formatCents(Math.abs(Number(tx.amount_cents)))}
                  <small>Saldo: {formatCents(tx.balance_after)}</small>
                </div>
              </div>
            ))}
        </section>
      </div>
    </div>
  );
}
