import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { formatCents } from '../context/WalletContext';

const STATUS_LABELS = {
  scheduled: 'Programado',
  live: 'En vivo',
  finished: 'Finalizado',
  cancelled: 'Cancelado',
};

const RESULT_LABELS = {
  home: 'Local',
  draw: 'Empate',
  away: 'Visita',
};

export default function Admin() {
  const [summary, setSummary] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadAll() {
    setLoading(true);
    setError('');
    try {
      const [summaryData, eventsData] = await Promise.all([
        api.adminSummary(),
        api.adminListEvents(),
      ]);
      setSummary(summaryData);
      setEvents(eventsData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  return (
    <div>
      <h1 className="page-title">Panel de administración</h1>
      <p className="page-sub">Crea eventos, carga cuotas y liquida resultados.</p>

      {error && <div className="error-banner">{error}</div>}

      {summary && <SummaryCards summary={summary} />}

      <div className="admin-section">
        <h2>Crear evento</h2>
        <div className="panel">
          <CreateEventForm onCreated={loadAll} />
        </div>
      </div>

      <div className="admin-section">
        <h2>Eventos ({events.length})</h2>
        {loading && <div className="empty-state">Cargando…</div>}
        {!loading && events.length === 0 && (
          <div className="empty-state">Todavía no hay eventos. Crea el primero arriba.</div>
        )}
        {events.map((event) => (
          <EventAdminRow key={event.id} event={event} onChanged={loadAll} />
        ))}
      </div>
    </div>
  );
}

function SummaryCards({ summary }) {
  return (
    <div className="stat-grid">
      <div className="stat-card">
        <div className="stat-label">Usuarios activos</div>
        <div className="stat-value">{summary.total_users}</div>
      </div>
      <div className="stat-card">
        <div className="stat-label">Saldo total en circulación</div>
        <div className="stat-value">{formatCents(summary.total_wallet_balance_cents)}</div>
      </div>
      <div className="stat-card">
        <div className="stat-label">Apuestas pendientes</div>
        <div className="stat-value">{summary.bets.pending_count}</div>
        <div className="text-sage" style={{ fontSize: 12, marginTop: 4 }}>
          {formatCents(summary.bets.pending_stake_cents)} en juego
        </div>
      </div>
      <div className="stat-card">
        <div className="stat-label">Eventos</div>
        <div className="stat-value">
          {summary.events_by_status.scheduled + summary.events_by_status.live}
        </div>
        <div className="text-sage" style={{ fontSize: 12, marginTop: 4 }}>
          {summary.events_by_status.scheduled} programados · {summary.events_by_status.live} en vivo ·{' '}
          {summary.events_by_status.finished} finalizados
        </div>
      </div>
      <div className="stat-card">
        <div className="stat-label">Resultado neto del casino (hoy)</div>
        <div className={`stat-value ${summary.casino.house_net_today_cents < 0 ? 'text-brick' : ''}`}>
          {formatCents(summary.casino.house_net_today_cents)}
        </div>
        <div className="text-sage" style={{ fontSize: 12, marginTop: 4 }}>
          {summary.casino.rounds_today_count} rondas hoy
        </div>
      </div>
    </div>
  );
}

function CreateEventForm({ onCreated }) {
  const [sport, setSport] = useState('futbol');
  const [homeTeam, setHomeTeam] = useState('');
  const [awayTeam, setAwayTeam] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setMessage('');
    try {
      await api.adminCreateEvent({
        sport,
        homeTeam,
        awayTeam,
        startsAt: new Date(startsAt).toISOString(),
      });
      setHomeTeam('');
      setAwayTeam('');
      setStartsAt('');
      setMessage('Evento creado.');
      await onCreated();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="inline-form">
      <div className="field">
        <label htmlFor="sport">Deporte</label>
        <select id="sport" value={sport} onChange={(e) => setSport(e.target.value)}>
          <option value="futbol">Fútbol</option>
          <option value="basket">Básquet</option>
          <option value="tenis">Tenis</option>
          <option value="voley">Vóley</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="homeTeam">Local</label>
        <input
          id="homeTeam"
          value={homeTeam}
          onChange={(e) => setHomeTeam(e.target.value)}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="awayTeam">Visita</label>
        <input
          id="awayTeam"
          value={awayTeam}
          onChange={(e) => setAwayTeam(e.target.value)}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="startsAt">Inicio</label>
        <input
          id="startsAt"
          type="datetime-local"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          required
        />
      </div>
      <button className="btn" type="submit" disabled={submitting}>
        {submitting ? 'Creando…' : 'Crear evento'}
      </button>
      {message && <div className="text-sage" style={{ fontSize: 13, width: '100%' }}>{message}</div>}
    </form>
  );
}

function EventAdminRow({ event, onChanged }) {
  const [expanded, setExpanded] = useState(false);
  const isOpenForBetting = event.status === 'scheduled' || event.status === 'live';

  return (
    <div className="ticket" style={{ flexDirection: 'column', alignItems: 'stretch', marginBottom: 10 }}>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
        onClick={() => setExpanded((v) => !v)}
      >
        <div>
          <div className="text-sage" style={{ fontSize: 12 }}>{event.sport}</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>
            {event.home_team} vs {event.away_team}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div className="text-sage mono" style={{ fontSize: 12 }}>
            {event.odds_count} cuota{event.odds_count === 1 ? '' : 's'} · {event.pending_bets_count} apuesta
            {event.pending_bets_count === 1 ? '' : 's'} pendiente{event.pending_bets_count === 1 ? '' : 's'}
          </div>
          <div className="text-sage mono" style={{ fontSize: 13 }}>
            {new Date(event.starts_at).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })}
          </div>
          <span className={`badge badge-${event.status}`}>{STATUS_LABELS[event.status] || event.status}</span>
        </div>
      </div>

      {expanded && (
        <>
          <hr className="divider" />
          {event.result && (
            <div className="text-sage" style={{ fontSize: 13, marginBottom: 10 }}>
              Resultado: <span className="text-gold">{RESULT_LABELS[event.result] || event.result}</span>
            </div>
          )}
          {isOpenForBetting && (
            <>
              <AddOddsForm eventId={event.id} onAdded={onChanged} />
              <hr className="divider" />
              <FinishEventForm eventId={event.id} onFinished={onChanged} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function AddOddsForm({ eventId, onAdded }) {
  const [selection, setSelection] = useState('home');
  const [price, setPrice] = useState('2.00');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setMessage('');
    try {
      await api.adminSetOdds(eventId, { market: '1x2', selection, price: Number(price) });
      setMessage('Cuota agregada.');
      await onAdded();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="inline-form">
      <div className="text-sage" style={{ fontSize: 13, width: '100%', marginBottom: -4 }}>
        Agregar cuota (mercado 1x2)
      </div>
      <div className="field">
        <label htmlFor={`selection-${eventId}`}>Selección</label>
        <select id={`selection-${eventId}`} value={selection} onChange={(e) => setSelection(e.target.value)}>
          <option value="home">Local</option>
          <option value="draw">Empate</option>
          <option value="away">Visita</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor={`price-${eventId}`}>Cuota</label>
        <input
          id={`price-${eventId}`}
          type="number"
          min="1.01"
          max="1000"
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          required
        />
      </div>
      <button className="btn-ghost" type="submit" disabled={submitting}>
        {submitting ? 'Agregando…' : 'Agregar cuota'}
      </button>
      {message && <div className="text-sage" style={{ fontSize: 13, width: '100%' }}>{message}</div>}
    </form>
  );
}

function FinishEventForm({ eventId, onFinished }) {
  const [result, setResult] = useState('home');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  async function handleFinish() {
    const sure = window.confirm(
      `¿Finalizar este evento con resultado "${RESULT_LABELS[result]}"? Esto liquida todas las apuestas pendientes y no se puede deshacer.`
    );
    if (!sure) return;

    setSubmitting(true);
    setMessage('');
    try {
      const settlement = await api.adminFinishEvent(eventId, result);
      setMessage(`Liquidado: ${settlement.settled_count} apuesta(s) resuelta(s).`);
      await onFinished();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="inline-form">
      <div className="text-sage" style={{ fontSize: 13, width: '100%', marginBottom: -4 }}>
        Finalizar evento y liquidar apuestas
      </div>
      <div className="field">
        <label htmlFor={`result-${eventId}`}>Resultado</label>
        <select id={`result-${eventId}`} value={result} onChange={(e) => setResult(e.target.value)}>
          <option value="home">Local</option>
          <option value="draw">Empate</option>
          <option value="away">Visita</option>
        </select>
      </div>
      <button className="btn" type="button" onClick={handleFinish} disabled={submitting}>
        {submitting ? 'Liquidando…' : 'Finalizar y liquidar'}
      </button>
      {message && <div className="text-sage" style={{ fontSize: 13, width: '100%' }}>{message}</div>}
    </div>
  );
}
