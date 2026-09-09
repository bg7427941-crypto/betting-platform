import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useWallet, formatCents } from '../context/WalletContext';

const MARKET_LABELS = {
  '1x2': 'Ganador del partido',
};

const SELECTION_LABELS = {
  home: 'Local',
  draw: 'Empate',
  away: 'Visita',
};

export default function Sportsbook() {
  const { refresh } = useWallet();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedOdds, setSelectedOdds] = useState(null);
  const [stake, setStake] = useState('10');
  const [placing, setPlacing] = useState(false);
  const [message, setMessage] = useState('');

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

  function selectOdds(event, odds) {
    setSelectedEvent(event);
    setSelectedOdds(odds);
    setMessage('');
  }

  async function placeBet() {
    setPlacing(true);
    setMessage('');
    try {
      const stakeCents = Math.round(Number(stake) * 100);
      await api.placeBet({
        eventId: selectedEvent.id,
        oddsId: selectedOdds.id,
        stake_cents: stakeCents,
      });
      setMessage('Apuesta colocada.');
      setSelectedEvent(null);
      setSelectedOdds(null);
      await refresh();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setPlacing(false);
    }
  }

  return (
    <div>
      <h1 className="page-title">Deportes</h1>
      <p className="page-sub">Próximos eventos y en vivo. Elige una cuota para armar tu apuesta.</p>

      {error && <div className="error-banner">{error}</div>}

      {loading && <div className="empty-state">Cargando eventos…</div>}

      {!loading && events.length === 0 && (
        <div className="empty-state">
          Todavía no hay eventos cargados. Un administrador puede crear eventos desde
          <span className="mono"> POST /api/sports/admin/events</span>.
        </div>
      )}

      <div style={{ display: 'flex', gap: 24 }}>
        <div style={{ flex: 1 }}>
          {events.map((event) => (
            <EventRow key={event.id} event={event} onSelectOdds={selectOdds} selectedOdds={selectedOdds} />
          ))}
        </div>

        {selectedEvent && (
          <div className="panel" style={{ width: 280, flexShrink: 0, alignSelf: 'flex-start' }}>
            <div className="text-sage" style={{ fontSize: 13 }}>Boleta de apuesta</div>
            <div style={{ margin: '8px 0 2px', fontFamily: 'var(--font-display)', fontSize: 17 }}>
              {selectedEvent.home_team} vs {selectedEvent.away_team}
            </div>
            <div className="text-gold mono" style={{ fontSize: 14, marginBottom: 14 }}>
              {SELECTION_LABELS[selectedOdds.selection] || selectedOdds.selection} @ {Number(selectedOdds.price).toFixed(2)}
            </div>

            <div className="field">
              <label htmlFor="stake">Monto (PEN)</label>
              <input
                id="stake"
                type="number"
                min="1"
                step="1"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
              />
            </div>

            <div className="text-sage" style={{ fontSize: 13, marginBottom: 14 }}>
              Retorno potencial:{' '}
              <span className="mono text-gold">
                {formatCents(Math.round(Number(stake || 0) * 100 * Number(selectedOdds.price)))}
              </span>
            </div>

            {message && <div className="text-sage" style={{ fontSize: 13, marginBottom: 10 }}>{message}</div>}

            <button className="btn" style={{ width: '100%' }} onClick={placeBet} disabled={placing}>
              {placing ? 'Apostando…' : 'Confirmar apuesta'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function EventRow({ event, onSelectOdds, selectedOdds }) {
  const [expanded, setExpanded] = useState(false);
  const [full, setFull] = useState(null);

  async function toggle() {
    if (!expanded && !full) {
      const data = await api.getEvent(event.id);
      setFull(data);
    }
    setExpanded((v) => !v);
  }

  return (
    <div className="ticket" style={{ flexDirection: 'column', alignItems: 'stretch', marginBottom: 10 }}>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }}
        onClick={toggle}
      >
        <div>
          <div className="text-sage" style={{ fontSize: 12 }}>{event.sport}</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>
            {event.home_team} vs {event.away_team}
          </div>
        </div>
        <div className="text-sage mono" style={{ fontSize: 13, alignSelf: 'center' }}>
          {new Date(event.starts_at).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })}
        </div>
      </div>

      {expanded && full && (
        <>
          <hr className="divider" />
          {Object.entries(groupByMarket(full.odds)).map(([market, oddsList]) => (
            <div key={market} style={{ marginBottom: 8 }}>
              <div className="text-sage" style={{ fontSize: 12, marginBottom: 6 }}>
                {MARKET_LABELS[market] || market}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {oddsList.map((odds) => (
                  <button
                    key={odds.id}
                    className={`odds-btn ${selectedOdds?.id === odds.id ? 'selected' : ''}`}
                    onClick={() => onSelectOdds(event, odds)}
                  >
                    <div style={{ fontSize: 11, marginBottom: 2 }}>
                      {SELECTION_LABELS[odds.selection] || odds.selection}
                    </div>
                    {Number(odds.price).toFixed(2)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </>
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
