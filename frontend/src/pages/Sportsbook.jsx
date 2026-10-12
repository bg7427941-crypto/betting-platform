import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useWallet, formatCents } from '../context/WalletContext';
import { useNotice } from '../lib/useNotice';
import QuickAmounts from '../components/QuickAmounts';
import Icon from '../components/Icon';

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
  basket: 'Básquet',
  tenis: 'Tenis',
  voley: 'Vóley',
};

function sportLabel(sport) {
  if (!sport) return '';
  return SPORT_LABELS[sport.toLowerCase()] || sport.charAt(0).toUpperCase() + sport.slice(1);
}

function formatDate(value) {
  return new Date(value).toLocaleString('es-PE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

const normalizeText = (value) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const sportKey = (value) => (normalizeText(value) === 'basket' ? 'basquet' : normalizeText(value));

export default function Sportsbook() {
  const { user } = useAuth();
  const { balanceCents, refresh, error: balanceError } = useWallet();
  const [view, setView] = useState('events'); // 'events' | 'my-bets'
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [sport, setSport] = useState('');
  const sports = [
    ...new Set([
      'futbol',
      'basquet',
      'tenis',
      'voley',
      ...events.map((event) => sportKey(event.sport)),
    ]),
  ];
  const filteredEvents = events.filter(
    (event) =>
      (!sport || sportKey(event.sport) === sport) &&
      normalizeText(`${event.home_team} ${event.away_team} ${sportLabel(event.sport)}`).includes(
        normalizeText(query.trim())
      )
  );

  function clearFilters() {
    setQuery('');
    setSport('');
  }

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
    if (placing) return;
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
  const canBet =
    balanceCents !== null && !balanceError && !stakeInvalid && !overBalance && !placing;

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
      <div className="page-heading">
        <div>
          <span className="eyebrow">EL JUEGO EMPIEZA AQUÍ</span>
          <h1 className="page-title">Deportes</h1>
          <p className="page-sub">Encuentra tu partido. Elige tu cuota. Sigue la emoción.</p>
        </div>
        <span className="demo-pill">Saldo virtual</span>
      </div>

      <section className="sports-hero" aria-label="Cómo empezar">
        <div>
          <span className="eyebrow">TU ASIENTO EN PRIMERA FILA</span>
          <h2>
            Cada partido,
            <br />
            <em>una nueva historia.</em>
          </h2>
          <p>Explora los eventos y selecciona una cuota para preparar tu apuesta.</p>
          <span className="hero-footnote">
            <Icon name="shield" size={14} /> Modo demo · Sin dinero real
          </span>
        </div>
        <svg className="sports-hero-art" viewBox="0 0 240 190" fill="none" aria-hidden="true">
          <rect x="10" y="15" width="220" height="160" rx="12" strokeWidth="1.5" />
          <rect x="20" y="25" width="200" height="140" rx="3" />
          <path d="M120 25v140M20 64h36v62H20m200-62h-36v62h36M20 80h15v30H20m200-30h-15v30h15" />
          <circle cx="120" cy="95" r="25" />
          <circle cx="120" cy="95" r="2" fill="#e4c58b" />
          <circle cx="150" cy="125" r="19" fill="#e4c58b" stroke="none" />
          <path
            d="m146 120 5-3 5 4-2 6h-6l-2-7Zm4-14 1 11m16 6-11-2m2 21-4-15m-17 13 11-13m-17-6 15-1"
            stroke="#204632"
            strokeWidth="1.5"
          />
        </svg>
      </section>

      <div className="view-switch" role="group" aria-label="Vista de deportes">
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
          <div className="sports-toolbar">
            <div className="sport-filters" role="group" aria-label="Filtrar por deporte">
              <button
                className={`filter-chip${sport === '' ? ' active' : ''}`}
                aria-pressed={sport === ''}
                onClick={() => setSport('')}
              >
                Todos
              </button>
              {sports.map((value) => (
                <button
                  key={value}
                  className={`filter-chip${sport === value ? ' active' : ''}`}
                  aria-pressed={sport === value}
                  onClick={() => setSport(value)}
                >
                  {sportLabel(value)}
                </button>
              ))}
            </div>
            <div className="search-field">
              <Icon name="search" size={17} />
              <input
                type="search"
                placeholder="Buscar equipo o deporte"
                aria-label="Buscar equipo o deporte"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  className="icon-button"
                  onClick={() => setQuery('')}
                  aria-label="Borrar búsqueda"
                >
                  <Icon name="close" size={16} />
                </button>
              )}
            </div>
          </div>
          <div className="section-caption">
            <span role="status">
              {loading ? (
                'Buscando eventos…'
              ) : error ? (
                'Eventos no disponibles'
              ) : (
                <>
                  <strong>
                    {filteredEvents.length} {filteredEvents.length === 1 ? 'evento' : 'eventos'}
                  </strong>{' '}
                  {sport || query ? 'en tu búsqueda' : 'disponibles'}
                </>
              )}
            </span>
            <button className="link-btn" onClick={loadEvents} disabled={loading}>
              <Icon name="refresh" size={14} /> Actualizar
            </button>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              {error}{' '}
              <button className="link-btn" onClick={loadEvents}>
                Reintentar
              </button>
            </div>
          )}

          {loading && (
            <div className="skeleton-list" role="status" aria-label="Cargando eventos">
              <div className="skeleton-card" />
              <div className="skeleton-card" />
              <div className="skeleton-card" />
            </div>
          )}

          {!loading && !error && filteredEvents.length === 0 && (
            <div className="empty-card">
              <Icon name="sports" size={34} />
              <h2>
                {events.length
                  ? 'No encontramos ese partido'
                  : 'El próximo partido está por llegar'}
              </h2>
              <p>
                {events.length
                  ? 'Prueba con otro equipo o explora todos los deportes.'
                  : 'Todavía no hay eventos publicados. Puedes actualizar la lista o explorar el casino mientras tanto.'}
              </p>
              {events.length ? (
                <button className="btn-ghost" onClick={clearFilters}>
                  Limpiar filtros
                </button>
              ) : user?.role === 'admin' ? (
                <Link className="btn-ghost" to="/admin">
                  Crear un evento <Icon name="arrow" size={16} />
                </Link>
              ) : (
                <Link className="btn-ghost" to="/casino">
                  Explorar casino <Icon name="arrow" size={16} />
                </Link>
              )}
            </div>
          )}

          <div className={`sb-layout${selectedEvent ? ' has-slip' : ''}`}>
            <div className="sb-events">
              {!loading &&
                !error &&
                filteredEvents.map((event) => (
                  <EventRow
                    key={event.id}
                    event={event}
                    onSelectOdds={selectOdds}
                    selectedOdds={selectedOdds}
                  />
                ))}
            </div>

            {selectedEvent && (
              <aside className="panel betslip" aria-label="Boleta de apuesta">
                <div className="betslip-head">
                  <div>
                    <div className="text-sage" style={{ fontSize: 13 }}>
                      Boleta de apuesta
                    </div>
                    <div
                      style={{
                        margin: '8px 0 2px',
                        fontFamily: 'var(--font-display)',
                        fontSize: 17,
                      }}
                    >
                      {selectedEvent.home_team} vs {selectedEvent.away_team}
                    </div>
                  </div>
                  <button
                    className="betslip-close"
                    onClick={closeSlip}
                    disabled={placing}
                    aria-label="Quitar de la boleta"
                  >
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
                    disabled={placing}
                    value={stake}
                    onChange={(e) => setStake(e.target.value)}
                    aria-invalid={stakeInvalid || overBalance}
                    aria-describedby="stake-hint"
                  />
                </div>

                <QuickAmounts value={stake} onPick={setStake} disabled={placing} />

                <div id="stake-hint" aria-live="polite">
                  {balanceCents === null && (
                    <div className="field-hint">
                      Espera a que tu saldo esté disponible para confirmar.
                    </div>
                  )}
                  {stakeInvalid && (
                    <div className="field-hint is-error">Ingresa un monto de al menos S/ 1.</div>
                  )}
                  {overBalance && (
                    <div className="field-hint is-error">
                      Tu saldo es {formatCents(balanceCents)}. Baja el monto o{' '}
                      <Link to="/wallet" className="text-gold">
                        deposita en tu billetera
                      </Link>
                      .
                    </div>
                  )}
                </div>

                <div className="text-sage" style={{ fontSize: 13, marginBottom: 14 }}>
                  Retorno potencial:{' '}
                  <span className="mono text-gold">
                    {stakeInvalid
                      ? '—'
                      : formatCents(Math.round(stakeCents * Number(selectedOdds.price)))}
                  </span>
                </div>

                {slipError && (
                  <div className="error-banner" role="alert">
                    {slipError}
                  </div>
                )}

                <button
                  className="btn"
                  style={{ width: '100%' }}
                  onClick={placeBet}
                  disabled={!canBet}
                >
                  {placing ? 'Apostando…' : 'Confirmar apuesta'}
                </button>
              </aside>
            )}
            {!selectedEvent && filteredEvents.length > 0 && !loading && !error && (
              <aside className="betslip-empty">
                <Icon name="ticket" size={30} />
                <h3>Tu boleta de apuesta</h3>
                <p>
                  Selecciona un partido y elige una cuota. Aquí verás el monto y el retorno
                  potencial antes de confirmar.
                </p>
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
  }, []);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await api.listMyBets();
      setBets(data);
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
      {!loading &&
        !error &&
        bets.filter((b) => !statusFilter || b.status === statusFilter).length === 0 && (
          <div className="empty-card">
            <Icon name="ticket" size={32} />
            <h3>
              {statusFilter ? 'Sin apuestas en esta categoría' : 'Tu primera boleta te espera'}
            </h3>
            <p>
              {statusFilter
                ? 'Elige otra categoría para revisar tus apuestas.'
                : 'Vuelve a Eventos y elige una cuota. Podrás seguir tus apuestas desde aquí.'}
            </p>
          </div>
        )}

      {!loading &&
        !error &&
        bets
          .filter((b) => !statusFilter || b.status === statusFilter)
          .map((bet) => (
            <div
              key={bet.id}
              className="ticket"
              style={{ marginBottom: 8, flexWrap: 'wrap', gap: 10 }}
            >
              <div style={{ minWidth: 200 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>
                  {bet.home_team} vs {bet.away_team}
                </div>
                <div className="text-sage" style={{ fontSize: 12 }}>
                  {SELECTION_LABELS[bet.selection] || bet.selection} @{' '}
                  {Number(bet.price_taken).toFixed(2)} · {formatDate(bet.created_at)}
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
              <span className={`badge badge-${bet.status}`}>
                {BET_STATUS_LABELS[bet.status] || bet.status}
              </span>
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
      <button
        className="event-head"
        onClick={toggle}
        aria-expanded={expanded}
        aria-controls={panelId}
      >
        <div>
          <div className="text-sage" style={{ fontSize: 12 }}>
            {sportLabel(event.sport)}
          </div>
          <div className="event-team-names">
            <span className="team-monogram" aria-hidden="true">
              {event.home_team.slice(0, 2).toUpperCase()}
            </span>
            <span>{event.home_team}</span>
            <span className="versus">vs</span>
            <span>{event.away_team}</span>
          </div>
        </div>
        <div className="event-meta">
          {event.status === 'live' && <span className="badge badge-live">En vivo</span>}
          <span className="text-sage mono" style={{ fontSize: 13 }}>
            {formatDate(event.starts_at)}
          </span>
          <span className="event-chevron" aria-hidden="true">
            ▼
          </span>
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
