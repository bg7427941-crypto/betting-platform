import { useCallback, useEffect, useRef, useState } from 'react';
import { connectLiveBlackjack } from '../lib/liveSocket';
import { useAuth } from '../context/AuthContext';
import { useWallet, formatCents } from '../context/WalletContext';
import * as sound from '../lib/sound';

const CHIPS = [1, 5, 10, 25, 100];

const SUIT_COLOR = { '♥': 'text-brick', '♦': 'text-brick' };

const OUTCOME_LABEL = {
  player_blackjack: '¡Blackjack! 3:2',
  win: 'Ganó',
  push: 'Empate',
  loss: 'Perdió',
  bust: 'Se pasó',
};

const PHASE_LABEL = {
  betting: 'Apuestas abiertas',
  dealing: 'Repartiendo…',
  player_turns: 'Turno de jugadores',
  dealer_phase: 'Juega el dealer…',
  settlement: 'Resultados',
};

function Card({ card, small }) {
  if (!card) return null;
  if (card.hidden) return <div className={`bj-card bj-card-back ${small ? 'bj-card-sm' : ''}`} />;
  return (
    <div className={`bj-card bj-card-deal ${SUIT_COLOR[card.suit] || ''} ${small ? 'bj-card-sm' : ''}`}>
      <span className="bj-card-rank">{card.rank}</span>
      <span className="bj-card-suit">{card.suit}</span>
      <span className="bj-card-rank bj-card-rank-mirror">{card.rank}</span>
    </div>
  );
}

function useCountdown(deadline) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!deadline) {
      setRemaining(0);
      return undefined;
    }
    const tick = () => setRemaining(Math.max(0, deadline - Date.now()));
    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [deadline]);
  return remaining;
}

function TableCard({ cfg, onJoin }) {
  return (
    <div className="live-table-card">
      <div className="live-table-card-head">
        <span className="mono text-gold">{cfg.name}</span>
        <span className="mono text-sage">
          hasta {cfg.maxSeats} jugadores
        </span>
      </div>
      <p className="mono">
        Apuesta: {formatCents(cfg.minBetCents)} – {formatCents(cfg.maxBetCents)}
      </p>
      <div className="bj-actions">
        <button className="btn" onClick={() => onJoin(cfg.id, true)}>
          Sentarme
        </button>
        <button className="btn-ghost" onClick={() => onJoin(cfg.id, false)}>
          Mirar
        </button>
      </div>
    </div>
  );
}

function Seat({ seat, index, isYou, activeSeatIndex, phase }) {
  const isActive = phase === 'player_turns' && index === activeSeatIndex;
  if (!seat) return <div className="live-seat live-seat-empty mono">Vacío</div>;
  return (
    <div
      className={`live-seat ${isActive ? 'live-seat-active' : ''} ${isYou ? 'live-seat-you' : ''} ${
        !seat.connected ? 'live-seat-disconnected' : ''
      }`}
    >
      <div className="bj-hand-title">
        <span className="bj-hand-icon">👤</span>
        {seat.name}
        {isYou && <span className="bj-tag">vos</span>}
        {!seat.connected && <span className="bj-tag">desconectado</span>}
        {isActive && <span className="bj-turn-dot" />}
      </div>
      {seat.betCents > 0 ? (
        <>
          <div className="bj-cards">
            {seat.cards.map((c, i) => (
              <Card key={i} card={c} small />
            ))}
          </div>
          <p className="mono text-gold live-seat-value">
            {seat.value ? seat.value.value : ''} · apuesta {formatCents(seat.betCents)}
            {seat.doubled ? ' (doblada)' : ''}
          </p>
          {seat.resultOutcome && (
            <p className={`mono ${seat.payoutCents > 0 ? 'text-gold' : 'text-brick'}`}>
              {OUTCOME_LABEL[seat.resultOutcome] || seat.resultOutcome}
              {seat.payoutCents > 0 ? ` · +${formatCents(seat.payoutCents)}` : ''}
            </p>
          )}
        </>
      ) : (
        <p className="mono text-sage">esperando apuesta…</p>
      )}
    </div>
  );
}

export default function LiveBlackjack() {
  const { user } = useAuth();
  const { refresh } = useWallet();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [tablesList, setTablesList] = useState([]);
  const [table, setTable] = useState(null);
  const [currentTableId, setCurrentTableId] = useState(null);
  const [seated, setSeated] = useState(false);
  const [stakeCents, setStakeCents] = useState(0);
  const [selectedChip, setSelectedChip] = useState(5);
  const [error, setError] = useState('');
  const prevPhaseRef = useRef(null);

  useEffect(() => {
    const socket = connectLiveBlackjack();
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('tables:list', (list) => setTablesList(list));
    socket.on('table:error', (msg) => setError(msg));
    socket.on('table:state', (state) => {
      setTable(state);
      refresh();
    });

    return () => socket.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!table || !user) return;
    setSeated(table.seats.some((s) => s && s.userId === user.id));
  }, [table, user]);

  useEffect(() => {
    if (!table) return;
    if (prevPhaseRef.current && prevPhaseRef.current !== table.phase) {
      if (table.phase === 'dealing') sound.playDealSequence(6);
      if (table.phase === 'settlement' && user) {
        const mine = table.seats.find((s) => s && s.userId === user.id);
        if (mine && mine.resultOutcome) {
          if (mine.resultOutcome === 'player_blackjack') sound.playBlackjack();
          else if (mine.resultOutcome === 'win') sound.playWin();
          else if (mine.resultOutcome === 'push') sound.playPush();
          else sound.playLose();
        }
      }
    }
    prevPhaseRef.current = table.phase;
  }, [table, user]);

  const bettingRemaining = useCountdown(table?.bettingDeadline);
  const turnRemaining = useCountdown(table?.turnDeadline);

  const joinTable = useCallback((tableId, seat) => {
    setError('');
    setStakeCents(0);
    socketRef.current?.emit('table:join', { tableId, seat });
    setCurrentTableId(tableId);
  }, []);

  const takeSeatInCurrentTable = useCallback(() => {
    if (currentTableId) joinTable(currentTableId, true);
  }, [currentTableId, joinTable]);

  function leaveTable() {
    socketRef.current?.emit('table:leave');
    setCurrentTableId(null);
    setTable(null);
    setSeated(false);
  }

  function addChip(value) {
    sound.playChip();
    setSelectedChip(value);
    setStakeCents((prev) => prev + value * 100);
  }

  function placeBet() {
    if (stakeCents <= 0) return;
    socketRef.current?.emit('table:bet', { amountCents: stakeCents });
  }

  function hit() {
    socketRef.current?.emit('table:hit');
    sound.playCard();
  }
  function stand() {
    socketRef.current?.emit('table:stand');
  }
  function doubleDown() {
    socketRef.current?.emit('table:double');
    sound.playCard();
  }

  const myIndex = table && user ? table.seats.findIndex((s) => s && s.userId === user.id) : -1;
  const mySeat = myIndex >= 0 ? table.seats[myIndex] : null;
  const myTurn = table?.phase === 'player_turns' && myIndex === table.activeSeatIndex;
  const iBet = mySeat && mySeat.betCents > 0;

  if (!table) {
    return (
      <div className="live-lobby">
        {!connected && <p className="mono text-sage">Conectando a las mesas…</p>}
        {error && <p className="text-brick">{error}</p>}
        <div className="live-table-list">
          {tablesList.map((cfg) => (
            <TableCard key={cfg.id} cfg={cfg} onJoin={joinTable} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bj-table live-table-view">
      <div className="live-table-header">
        <span className="mono text-gold">{table.name}</span>
        <span className="mono text-sage">
          🂠 {table.shoeRemaining} cartas en el zapato · {table.spectatorCount} mirando
        </span>
        <button className="btn-ghost" onClick={leaveTable}>
          Salir de la mesa
        </button>
      </div>

      <div className="bj-felt">
        <div className="bj-felt-legend">
          {PHASE_LABEL[table.phase]}
          {table.phase === 'betting' && ` · ${Math.ceil(bettingRemaining / 1000)}s`}
          {table.phase === 'player_turns' && ` · ${Math.ceil(turnRemaining / 1000)}s`}
        </div>

        <div className="bj-hand">
          <div className="bj-hand-title">
            <span className="bj-hand-icon">🎩</span>
            Dealer
            {table.dealerValue && (
              <span className="mono text-gold bj-hand-value">
                {table.dealerValue.value}
                {table.dealerValue.value > 21 ? ' — se pasó' : ''}
              </span>
            )}
          </div>
          <div className="bj-cards">
            {table.dealerCards.map((c, i) => (
              <Card key={i} card={c} />
            ))}
          </div>
        </div>

        <div className="bj-divider" />

        <div className="live-seats">
          {table.seats.map((seat, i) => (
            <Seat
              key={i}
              seat={seat}
              index={i}
              isYou={!!(seat && user && seat.userId === user.id)}
              activeSeatIndex={table.activeSeatIndex}
              phase={table.phase}
            />
          ))}
        </div>

        {!seated && (
          <button className="btn" onClick={takeSeatInCurrentTable}>
            Sentarme en esta mesa
          </button>
        )}

        {seated && table.phase === 'betting' && !iBet && (
          <div className="bj-bet-panel">
            <div className="chip-tray">
              {CHIPS.map((c) => (
                <button
                  key={c}
                  className={`chip-select ${selectedChip === c ? 'selected' : ''}`}
                  onClick={() => addChip(c)}
                >
                  S/{c}
                </button>
              ))}
              <button className="btn-ghost" onClick={() => setStakeCents(0)}>
                Limpiar
              </button>
            </div>
            <p>
              Apuesta: <span className="mono text-gold">{formatCents(stakeCents)}</span> (mín{' '}
              {formatCents(table.minBetCents)}, máx {formatCents(table.maxBetCents)})
            </p>
            <button className="btn" disabled={stakeCents <= 0} onClick={placeBet}>
              Apostar
            </button>
          </div>
        )}

        {seated && table.phase === 'betting' && iBet && (
          <p className="mono text-sage">Ya apostaste {formatCents(mySeat.betCents)} — esperando a que abra la mano…</p>
        )}

        {myTurn && mySeat && (
          <div className="bj-actions">
            <button className="btn" onClick={hit}>
              Pedir
            </button>
            <button className="btn" onClick={stand}>
              Plantarme
            </button>
            {mySeat.cards.length === 2 && !mySeat.doubled && (
              <button className="btn-ghost" onClick={doubleDown}>
                Doblar
              </button>
            )}
          </div>
        )}

        {error && <p className="text-brick">{error}</p>}
      </div>
    </div>
  );
}
