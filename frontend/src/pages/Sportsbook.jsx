import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useWallet, formatCents } from '../context/WalletContext';
import { useNotice } from '../lib/useNotice';
import QuickAmounts from '../components/QuickAmounts';

const MARKET_LABELS = {
  '1x2': 'Ganador del partido',
};

const SELECTION_LABELS = {
  home: 'Local',
  draw: 'Empate',
  away: 'Visita',
};

const BET_STATUS_LABELS = {
  pending: 'Pendiente',
  won: 'Ganada',
  lost: 'Perdida',
  void: 'Anulada',
};

const SPORT_LABELS = {
  futbol: 'Fútbol',
  basquet: 'Básquet',
  tenis: 'Tenis',
  voley: 'Vóley',
};

function sportLabel(sport) {
  if (!sport) return '';
  return SPORT_LABELS[sport.toLowerCase()] || sport.charAt(0).toUpperCase() + sport.slice(1);
}

function formatDate(value) {
  return new Date(value).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function Sportsbook() {
  const { user } = useAuth();
  const { balanceCents, refresh } = useWallet();
  const [view, setView] = useState('events'); // 'events' | 'my-bets'
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedOdds, setSelectedOdds] = useState(null);
  const [stake, setStake] = useState('10');
  const [placing, setPlacing] = useState(false);
  const [slipError, setSlipError] = useState('');
  const [notice, setNotice] = useNotice();

  useEffect(() => {
    loadEvents();
  }, []);

  async function loadEvents() {
    setLoading(true);
    setError('');
    try {
      const data = await api.listEvents();
      setEvents(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Tocar otra vez la cuota ya elegida la quita de la boleta.
  function selectOdds(event, odds) {
    setSlipError('');
    if (selectedOdds?.id === odds.id) {
      closeSlip();
      return;
    }
    setSelectedEvent(event);
    setSelectedOdds(odds);
  }

  function closeSlip() {
    setSelectedEvent(null);
    setSelectedOdds(null);
    setSlipError('');
  }

  const stakeValue = Number(stake);
  const stakeCents = Math.round(stakeValue * 100);
  const stakeInvalid = stake === '' || !Number.isFinite(stakeValue) || stakeCents < 100;
  const overBalance = balanceCents !== null && !stakeInvalid && stakeCents > balanceCents;
  const canBet = !stakeInvalid && !overBalance && !placing;

  async function placeBet() {
    if (!canBet) return;
    setPlacing(true);
    setSlipError('');
    try {
      await api.placeBet({
        eventId: selectedEvent.id,
        oddsId: selectedOdds.id,
        stake_cents: stakeCents,
      });
      // El aviso vive fuera de la boleta: antes se guardaba dentro del panel
      // que se cerraba al apostar, así que nunca se veía la confirmación.
      setNotice(
        `Apuesta colocada: ${SELECTION_LABELS[selectedOdds.selection] || selectedOdds.selection} ` +
          `en ${selectedEvent.home_team} vs ${selectedEvent.away_team} ` +
          `@ ${Number(selectedOdds.price).toFixed(2)} por ${formatCents(stakeCents)}.`
      );
      closeSlip();
      refresh().catch(() => {});
    } catch (err) {
      setSlipError(err.message);
    } finally {
      setPlacing(false);
    }
  }

  return (
    <div>
      <h1 className="page-title">Deportes</h1>
      <p className="page-sub">Próximos eventos y en vivo. Elige una cuota para armar tu apuesta.</p>

      <div className="view-switch">
        <button
          className={view === 'events' ? 'btn' : 'btn-ghost'}
          aria-pressed={view === 'events'}
          onClick={() => setView('events')}
        >
          Eventos
        </button>
        <button
          className={view === 'my-bets' ? 'btn' : 'btn-ghost'}
          aria-pressed={view === 'my-bets'}
          onClick={() => setView('my-bets')}
        >
          Mis apuestas
        </button>
      </div>

      {notice && (
        <div className="success-banner" role="status">
          <span>{notice}</span>
          {view === 'events' && (
            <button className="link-btn" onClick={() => setView('my-bets')}>
              Ver mis apuestas
            </button>
          )}
        </div>
      )}

      {view === 'my-bets' ? (
        <MyBets />
      ) : (
        <>
          {error && (
            <div className="error-banner" role="alert">
              {error}{' '}
              <button className="link-btn" onClick={loadEvents}>
                Reintentar
              </button>
            </div>
          )}

          {loading && (
            <div className="empty-state" role="status">
              Cargando eventos…
            </div>
          )}

          {!loading && !error && events.length === 0 && (
            <div className="empty-state">
              No hay eventos disponibles por ahora. Vuelve en un rato.
              {user?.role === 'admin' && (
                <>
                  {' '}
                  Puedes crear uno desde el <Link to="/admin" className="text-gold">panel de administración</Link>.
                </>
              )}
            </div>
          )}

          <div className={`sb-layout${selectedEvent ? ' has-slip' : ''}`}>
            <div className="sb-events">
              {events.map((event) => (
                <EventRow key={event.id} event={event} onSelectOdds={selectOdds} selectedOdds={selectedOdds} />
              ))}
            </div>

            {selectedEvent && (
              <aside className="panel betslip" aria-label="Boleta de apuesta">
                <div className="betslip-head">
                  <div>
                    <div className="text-sage" style={{ fontSize: 13 }}>Boleta de apuesta</div>
                    <div style={{ margin: '8px 0 2px', fontFamily: 'var(--font-display)', fontSize: 17 }}>
                      {selectedEvent.home_team} vs {selectedEvent.away_team}
                    </div>
                  </div>
                  <button className="betslip-close" onClick={closeSlip} aria-label="Quitar de la boleta">
                    ×
                  </button>
                </div>

                <div className="text-gold mono" style={{ fontSize: 14, marginBottom: 14 }}>
                  {SELECTION_LABELS[selectedOdds.selection] || selectedOdds.selection} @{' '}
                  {Number(selectedOdds.price).toFixed(2)}
                </div>

                <div className="field">
                  <label htmlFor="stake">Monto (PEN)</label>
                  <input
                    id="stake"
                    type="number"
                    inputMode="decimal"
                    min="1"
                    step="1"
                    value={stake}
                    onChange={(e) => setStake(e.target.value)}
                    aria-invalid={stakeInvalid || overBalance}
                    aria-describedby="stake-hint"
                  />
                </div>

                <QuickAmounts value={stake} onPick={setStake} disabled={placing} />

                <div id="stake-hint" aria-live="polite">
                  {stakeInvalid && <div className="field-hint is-error">Ingresa un monto de al menos S/ 1.</div>}
                  {overBalance && (
                    <div className="field-hint is-error">
                      Tu saldo es {formatCents(balanceCents)}. Baja el monto o{' '}
                      <Link to="/wallet" className="text-gold">deposita en tu billetera</Link>.
                    </div>
                  )}
                </div>

                <div className="text-sage" style={{ fontSize: 13, marginBottom: 14 }}>
                  Retorno potencial:{' '}
                  <span className="mono text-gold">
                    {stakeInvalid ? '—' : formatCents(Math.round(stakeCents * Number(selectedOdds.price)))}
                  </span>
                </div>

                {slipError && (
                  <div className="error-banner" role="alert">
                    {slipError}
                  </div>
                )}

                <button className="btn" style={{ width: '100%' }} onClick={placeBet} disabled={!canBet}>
                  {placing ? 'Apostando…' : 'Confirmar apuesta'}
                </button>
              </aside>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function MyBets() {
  const [bets, setBets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    load();
  }, [statusFilter]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await api.listMyBets();
      setBets(statusFilter ? data.filter((b) => b.status === statusFilter) : data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="view-switch" style={{ gap: 6, marginBottom: 16 }}>
        {[
          ['', 'Todas'],
          ['pending', 'Pendientes'],
          ['won', 'Ganadas'],
          ['lost', 'Perdidas'],
        ].map(([value, label]) => (
          <button
            key={value || 'all'}
            className={statusFilter === value ? 'btn' : 'btn-ghost'}
            aria-pressed={statusFilter === value}
            style={{ fontSize: 13, padding: '6px 12px' }}
            onClick={() => setStatusFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="error-banner" role="alert">
          {error}{' '}
          <button className="link-btn" onClick={load}>
            Reintentar
          </button>
        </div>
      )}
      {loading && (
        <div className="empty-state" role="status">
          Cargando…
        </div>
      )}
      {!loading && !error && bets.length === 0 && (
        <div className="empty-state">
          {statusFilter ? 'No tienes apuestas en esta categoría.' : 'Aún no has apostado. Elige una cuota en Eventos para empezar.'}
        </div>
      )}

      {bets.map((bet) => (
        <div key={bet.id} className="ticket" style={{ marginBottom: 8, flexWrap: 'wrap', gap: 10 }}>
          <div style={{ minWidth: 200 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>
              {bet.home_team} vs {bet.away_team}
            </div>
            <div className="text-sage" style={{ fontSize: 12 }}>
              {SELECTION_LABELS[bet.selection] || bet.selection} @ {Number(bet.price_taken).toFixed(2)} ·{' '}
              {formatDate(bet.created_at)}
            </div>
          </div>
          <div className="mono" style={{ minWidth: 90 }}>
            {formatCents(bet.stake_cents)}
          </div>
          <div className="mono" style={{ minWidth: 100 }}>
            {bet.status === 'won' ? (
              <span className="text-gold">+{formatCents(bet.payout_cents)}</span>
            ) : bet.status === 'lost' ? (
              <span className="text-brick">-{formatCents(bet.stake_cents)}</span>
            ) : (
              <span className="text-sage">—</span>
            )}
          </div>
          <span className={`badge badge-${bet.status}`}>{BET_STATUS_LABELS[bet.status] || bet.status}</span>
        </div>
      ))}
    </div>
  );
}

function EventRow({ event, onSelectOdds, selectedOdds }) {
  const [expanded, setExpanded] = useState(false);
  const [full, setFull] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const panelId = `event-odds-${event.id}`;

  async function loadOdds() {
    setLoading(true);
    setError('');
    try {
      setFull(await api.getEvent(event.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && !full) loadOdds();
  }

  return (
    <div className="ticket event-ticket">
      <button className="event-head" onClick={toggle} aria-expanded={expanded} aria-controls={panelId}>
        <div>
          <div className="text-sage" style={{ fontSize: 12 }}>{sportLabel(event.sport)}</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>
            {event.home_team} vs {event.away_team}
          </div>
        </div>
        <div className="event-meta">
          {event.status === 'live' && <span className="badge badge-live">En vivo</span>}
          <span className="text-sage mono" style={{ fontSize: 13 }}>{formatDate(event.starts_at)}</span>
          <span className="event-chevron" aria-hidden="true">▼</span>
        </div>
      </button>

      {expanded && (
        <div id={panelId}>
          <hr className="divider" />

          {loading && (
            <div className="text-sage" style={{ fontSize: 13 }} role="status">
              Cargando cuotas…
            </div>
          )}

          {error && (
            <div className="text-sage" style={{ fontSize: 13 }} role="alert">
              No pudimos cargar las cuotas ({error}).{' '}
              <button className="link-btn" onClick={loadOdds}>
                Reintentar
              </button>
            </div>
          )}

          {full && full.odds.length === 0 && (
            <div className="text-sage" style={{ fontSize: 13 }}>
              Este evento todavía no tiene cuotas.
            </div>
          )}

          {full &&
            Object.entries(groupByMarket(full.odds)).map(([market, oddsList]) => (
              <div key={market} style={{ marginBottom: 8 }}>
                <div className="text-sage" style={{ fontSize: 12, marginBottom: 6 }}>
                  {MARKET_LABELS[market] || market}
                </div>
                <div className="odds-row">
                  {oddsList.map((odds) => {
                    const selected = selectedOdds?.id === odds.id;
                    const label = SELECTION_LABELS[odds.selection] || odds.selection;
                    return (
                      <button
                        key={odds.id}
                        className={`odds-btn ${selected ? 'selected' : ''}`}
                        aria-pressed={selected}
                        aria-label={`${label}, cuota ${Number(odds.price).toFixed(2)}`}
                        onClick={() => onSelectOdds(event, odds)}
                      >
                        <div style={{ fontSize: 11, marginBottom: 2 }}>{label}</div>
                        {Number(odds.price).toFixed(2)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function groupByMarket(odds) {
  return odds.reduce((acc, o) => {
    (acc[o.market] = acc[o.market] || []).push(o);
    return acc;
  }, {});
}