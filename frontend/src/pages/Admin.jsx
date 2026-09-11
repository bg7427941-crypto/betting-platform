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

const SPORTS = [
  { value: 'futbol', label: 'Fútbol' },
  { value: 'basket', label: 'Básquet' },
  { value: 'tenis', label: 'Tenis' },
  { value: 'voley', label: 'Vóley' },
];

function pct(p) {
  return `${(p * 100).toFixed(1)}%`;
}

export default function Admin() {
  const [summary, setSummary] = useState(null);
  const [events, setEvents] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadAll() {
    setLoading(true);
    setError('');
    try {
      const [summaryData, eventsData, teamsData] = await Promise.all([
        api.adminSummary(),
        api.adminListEvents(),
        api.adminListTeams(),
      ]);
      setSummary(summaryData);
      setEvents(eventsData);
      setTeams(teamsData);
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
      <p className="page-sub">Gestiona equipos, crea eventos y calcula cuotas automáticamente.</p>

      {error && <div className="error-banner">{error}</div>}

      {summary && <SummaryCards summary={summary} />}

      <div className="admin-section">
        <h2>Equipos ({teams.length})</h2>
        <div className="panel">
          <CreateTeamForm onCreated={loadAll} />
        </div>
        <TeamsList teams={teams} onChanged={loadAll} />
      </div>

      <div className="admin-section">
        <h2>Crear evento</h2>
        <div className="panel">
          <CreateEventForm teams={teams} onCreated={loadAll} />
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

// ---------- Equipos ----------

function CreateTeamForm({ onCreated }) {
  const [name, setName] = useState('');
  const [sport, setSport] = useState('futbol');
  const [attackRating, setAttackRating] = useState('1.00');
  const [defenseRating, setDefenseRating] = useState('1.00');
  const [eloRating, setEloRating] = useState('1500');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const isFutbol = sport === 'futbol';

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setMessage('');
    try {
      await api.adminCreateTeam({
        name,
        sport,
        attackRating: isFutbol ? Number(attackRating) : undefined,
        defenseRating: isFutbol ? Number(defenseRating) : undefined,
        eloRating: !isFutbol ? Number(eloRating) : undefined,
      });
      setName('');
      setMessage('Equipo creado.');
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
        <label htmlFor="team-name">Nombre</label>
        <input id="team-name" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="field">
        <label htmlFor="team-sport">Deporte</label>
        <select id="team-sport" value={sport} onChange={(e) => setSport(e.target.value)}>
          {SPORTS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {isFutbol ? (
        <>
          <div className="field">
            <label htmlFor="team-attack">Ataque (1.0 = promedio)</label>
            <input
              id="team-attack"
              type="number"
              min="0.1"
              max="10"
              step="0.05"
              value={attackRating}
              onChange={(e) => setAttackRating(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="team-defense">Defensa (1.0 = promedio)</label>
            <input
              id="team-defense"
              type="number"
              min="0.1"
              max="10"
              step="0.05"
              value={defenseRating}
              onChange={(e) => setDefenseRating(e.target.value)}
            />
          </div>
        </>
      ) : (
        <div className="field">
          <label htmlFor="team-elo">Rating Elo</label>
          <input
            id="team-elo"
            type="number"
            min="100"
            max="4000"
            step="1"
            value={eloRating}
            onChange={(e) => setEloRating(e.target.value)}
          />
        </div>
      )}

      <button className="btn" type="submit" disabled={submitting}>
        {submitting ? 'Creando…' : 'Crear equipo'}
      </button>
      {message && <div className="text-sage" style={{ fontSize: 13, width: '100%' }}>{message}</div>}
    </form>
  );
}

function TeamsList({ teams, onChanged }) {
  if (teams.length === 0) {
    return <div className="empty-state">Todavía no hay equipos. Crea el primero arriba.</div>;
  }

  const bySport = teams.reduce((acc, t) => {
    (acc[t.sport] = acc[t.sport] || []).push(t);
    return acc;
  }, {});

  return (
    <div style={{ marginTop: 12 }}>
      {Object.entries(bySport).map(([sport, sportTeams]) => (
        <div key={sport} style={{ marginBottom: 16 }}>
          <div className="text-sage mono" style={{ fontSize: 12, marginBottom: 6, textTransform: 'uppercase' }}>
            {sport} ({sportTeams.length})
          </div>
          {sportTeams.map((team) => (
            <TeamRow key={team.id} team={team} onChanged={onChanged} />
          ))}
        </div>
      ))}
    </div>
  );
}

function TeamRow({ team, onChanged }) {
  const isFutbol = team.sport === 'futbol';
  const [attackRating, setAttackRating] = useState(team.attack_rating);
  const [defenseRating, setDefenseRating] = useState(team.defense_rating);
  const [eloRating, setEloRating] = useState(team.elo_rating);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  async function handleSave() {
    setSubmitting(true);
    setMessage('');
    try {
      await api.adminUpdateTeam(team.id, {
        attackRating: isFutbol ? Number(attackRating) : undefined,
        defenseRating: isFutbol ? Number(defenseRating) : undefined,
        eloRating: !isFutbol ? Number(eloRating) : undefined,
      });
      setMessage('Guardado.');
      await onChanged();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="ticket" style={{ marginBottom: 8, flexWrap: 'wrap', gap: 12 }}>
      <div style={{ minWidth: 140, fontFamily: 'var(--font-display)' }}>{team.name}</div>
      {isFutbol ? (
        <>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Ataque</label>
            <input
              type="number"
              min="0.1"
              max="10"
              step="0.05"
              value={attackRating}
              onChange={(e) => setAttackRating(e.target.value)}
              style={{ width: 80 }}
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Defensa</label>
            <input
              type="number"
              min="0.1"
              max="10"
              step="0.05"
              value={defenseRating}
              onChange={(e) => setDefenseRating(e.target.value)}
              style={{ width: 80 }}
            />
          </div>
        </>
      ) : (
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Elo</label>
          <input
            type="number"
            min="100"
            max="4000"
            step="1"
            value={eloRating}
            onChange={(e) => setEloRating(e.target.value)}
            style={{ width: 90 }}
          />
        </div>
      )}
      <button className="btn-ghost" type="button" onClick={handleSave} disabled={submitting}>
        {submitting ? 'Guardando…' : 'Guardar'}
      </button>
      {message && <div className="text-sage" style={{ fontSize: 12 }}>{message}</div>}
    </div>
  );
}

// ---------- Crear evento ----------

function CreateEventForm({ teams, onCreated }) {
  const [sport, setSport] = useState('futbol');
  const [useRegisteredTeams, setUseRegisteredTeams] = useState(true);
  const [homeTeamId, setHomeTeamId] = useState('');
  const [awayTeamId, setAwayTeamId] = useState('');
  const [homeTeam, setHomeTeam] = useState('');
  const [awayTeam, setAwayTeam] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const teamsForSport = teams.filter((t) => t.sport === sport);
  const canUseRegistered = teamsForSport.length >= 2;

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setMessage('');
    try {
      const payload = {
        sport,
        startsAt: new Date(startsAt).toISOString(),
      };
      if (useRegisteredTeams && canUseRegistered) {
        payload.homeTeamId = homeTeamId;
        payload.awayTeamId = awayTeamId;
      } else {
        payload.homeTeam = homeTeam;
        payload.awayTeam = awayTeam;
      }
      await api.adminCreateEvent(payload);
      setHomeTeam('');
      setAwayTeam('');
      setHomeTeamId('');
      setAwayTeamId('');
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
        <label htmlFor="event-sport">Deporte</label>
        <select
          id="event-sport"
          value={sport}
          onChange={(e) => {
            setSport(e.target.value);
            setHomeTeamId('');
            setAwayTeamId('');
          }}
        >
          {SPORTS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {canUseRegistered && (
        <label className="text-sage" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={useRegisteredTeams}
            onChange={(e) => setUseRegisteredTeams(e.target.checked)}
          />
          Usar equipos registrados (habilita cuotas automáticas)
        </label>
      )}

      {useRegisteredTeams && canUseRegistered ? (
        <>
          <div className="field">
            <label htmlFor="event-home-id">Local</label>
            <select id="event-home-id" value={homeTeamId} onChange={(e) => setHomeTeamId(e.target.value)} required>
              <option value="" disabled>Elegir…</option>
              {teamsForSport.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="event-away-id">Visita</label>
            <select id="event-away-id" value={awayTeamId} onChange={(e) => setAwayTeamId(e.target.value)} required>
              <option value="" disabled>Elegir…</option>
              {teamsForSport.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        </>
      ) : (
        <>
          {!canUseRegistered && (
            <div className="text-sage" style={{ fontSize: 12, width: '100%' }}>
              Necesitas al menos 2 equipos de {sport} registrados arriba para poder calcular cuotas
              automáticamente. Por ahora, escribe los nombres a mano:
            </div>
          )}
          <div className="field">
            <label htmlFor="event-home-text">Local</label>
            <input id="event-home-text" value={homeTeam} onChange={(e) => setHomeTeam(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="event-away-text">Visita</label>
            <input id="event-away-text" value={awayTeam} onChange={(e) => setAwayTeam(e.target.value)} required />
          </div>
        </>
      )}

      <div className="field">
        <label htmlFor="event-starts">Inicio</label>
        <input
          id="event-starts"
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

// ---------- Eventos: cuotas y liquidación ----------

function EventAdminRow({ event, onChanged }) {
  const [expanded, setExpanded] = useState(false);
  const canStillLoadOdds = event.status === 'scheduled'; // se cierra apenas arranca el partido
  const canFinish = event.status === 'scheduled' || event.status === 'live';
  const hasLinkedTeams = Boolean(event.home_team_id && event.away_team_id);

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
          {canStillLoadOdds && (
            <>
              {hasLinkedTeams ? (
                <AutoOddsForm eventId={event.id} onCalculated={onChanged} />
              ) : (
                <div className="text-sage" style={{ fontSize: 13, marginBottom: 10 }}>
                  Este evento no está vinculado a equipos registrados, así que no se pueden calcular cuotas
                  automáticamente — solo carga manual.
                </div>
              )}
              <hr className="divider" />
              <AddOddsForm eventId={event.id} onAdded={onChanged} />
              <hr className="divider" />
            </>
          )}
          {event.status === 'live' && (
            <div className="text-sage" style={{ fontSize: 13, marginBottom: 10 }}>
              El partido ya empezó — las apuestas están cerradas. Solo queda finalizarlo.
            </div>
          )}
          {canFinish && <FinishEventForm eventId={event.id} onFinished={onChanged} />}
        </>
      )}
    </div>
  );
}

function AutoOddsForm({ eventId, onCalculated }) {
  const [marginRate, setMarginRate] = useState('0.06');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function handleCalculate() {
    setSubmitting(true);
    setError('');
    setResult(null);
    try {
      const data = await api.adminCalculateOdds(eventId, Number(marginRate));
      setResult(data);
      await onCalculated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="inline-form">
      <div className="text-sage" style={{ fontSize: 13, width: '100%', marginBottom: -4 }}>
        Calcular cuotas automáticamente (según estadísticas de los equipos)
      </div>
      <div className="field">
        <label htmlFor={`margin-${eventId}`}>Margen de casa</label>
        <input
          id={`margin-${eventId}`}
          type="number"
          min="0"
          max="0.5"
          step="0.01"
          value={marginRate}
          onChange={(e) => setMarginRate(e.target.value)}
          style={{ width: 80 }}
        />
      </div>
      <button className="btn" type="button" onClick={handleCalculate} disabled={submitting}>
        {submitting ? 'Calculando…' : 'Calcular cuotas'}
      </button>
      {error && <div className="text-brick" style={{ fontSize: 13, width: '100%' }}>{error}</div>}
      {result && (
        <div className="text-sage" style={{ fontSize: 13, width: '100%' }}>
          Modelo: <span className="text-gold">{result.model === 'dixon_coles' ? 'Dixon-Coles (Poisson)' : 'Elo'}</span>
          {' · '}
          {Object.entries(result.probabilities)
            .map(([sel, p]) => `${RESULT_LABELS[sel] || sel}: ${pct(p)}`)
            .join(' · ')}
        </div>
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
        Agregar cuota manual (mercado 1x2)
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
