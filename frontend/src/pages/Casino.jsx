import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { useWallet, formatCents } from '../context/WalletContext';
import { RouletteWheel } from '../components/RouletteWheel';
import { BettingTable } from '../components/BettingTable';
import SlotsGame from '../components/SlotsGame';
import BlackjackTable from '../components/BlackjackTable';
import LiveBlackjack from '../components/LiveBlackjack';
import * as sound from '../lib/sound';
import Icon from '../components/Icon';
import SoundControls from '../components/SoundControls';

const GAMES = [
  {
    id: 'roulette',
    name: 'Ruleta',
    description: 'El clásico de la mesa',
    icon: 'casino',
  },
  {
    id: 'slots',
    name: 'Tragamonedas',
    description: 'Cinco carriles, diez líneas',
    icon: 'admin',
  },
  {
    id: 'blackjack',
    name: 'Blackjack',
    description: 'Practica a tu ritmo',
    icon: 'ticket',
  },
  {
    id: 'live',
    name: 'Blackjack en vivo',
    description: 'Comparte mesa en tiempo real',
    icon: 'live',
  },
];

function formatElapsed(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function SessionTracker({ netCents }) {
  const started = useRef(Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(
      () => setElapsedSeconds(Math.floor((Date.now() - started.current) / 1000)),
      1000
    );
    return () => clearInterval(id);
  }, []);
  return (
    <div className="session-tracker">
      <span>
        Sesión: <span className="mono">{formatElapsed(elapsedSeconds)}</span>
      </span>
      <span>
        Neto:{' '}
        <span
          className={`mono ${netCents > 0 ? 'text-gold' : netCents < 0 ? 'text-brick' : 'text-sage'}`}
        >
          {netCents > 0 ? '+' : ''}
          {formatCents(netCents)}
        </span>
      </span>
    </div>
  );
}

export default function Casino() {
  const [tab, setTab] = useState('roulette');
  // Contador de sesión: cuánto tiempo llevás jugando y el neto acumulado
  // (ganado - apostado) desde que entraste a esta pantalla. Vive acá, no en
  // Roulette/Slots, porque esos se re-montan al cambiar de tab (key={tab})
  // y perderían el acumulado; cada uno avisa sus rondas vía onRoundSettled.
  const [sessionNetCents, setSessionNetCents] = useState(0);

  useEffect(() => {
    sound.preloadSounds();
    const onVisibility = () => {
      if (document.hidden) sound.stopAllSounds();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      sound.stopAllSounds();
    };
  }, []);
  useEffect(() => () => sound.stopAllSounds(), [tab]);

  const handleRoundSettled = useCallback((netCents) => {
    setSessionNetCents((prev) => prev + netCents);
  }, []);

  return (
    <div onPointerDownCapture={sound.unlockAudio} onKeyDownCapture={sound.unlockAudio}>
      <div className="page-heading">
        <div>
          <span className="eyebrow">ELIGE TU MESA</span>
          <h1 className="page-title">Casino</h1>
          <p className="page-sub">Cuatro experiencias para descubrir. Siempre con saldo virtual.</p>
        </div>
        <span className="demo-pill">Modo demo</span>
      </div>

      <div className="casino-status-row">
        <SessionTracker netCents={sessionNetCents} />
        <SoundControls />
      </div>

      <div className="casino-tabs" role="group" aria-label="Seleccionar juego">
        {GAMES.map((game) => (
          <button
            key={game.id}
            className={`casino-game-button${tab === game.id ? ' active' : ''}`}
            aria-pressed={tab === game.id}
            onClick={() => setTab(game.id)}
          >
            <Icon name={game.icon} size={22} />
            <span>
              <strong>{game.name}</strong>
              <small>{game.description}</small>
            </span>
          </button>
        ))}
      </div>

      {tab === 'roulette' && (
        <div key="roulette" className="casino-tab-panel">
          <Roulette onRoundSettled={handleRoundSettled} />
        </div>
      )}
      {tab === 'slots' && (
        <div key="slots" className="casino-tab-panel">
          <SlotsGame onRoundSettled={handleRoundSettled} />
        </div>
      )}
      {tab === 'blackjack' && (
        <div key="blackjack" className="casino-tab-panel">
          <BlackjackTable onRoundSettled={handleRoundSettled} />
        </div>
      )}
      {tab === 'live' && (
        <div key="live" className="casino-tab-panel">
          <LiveBlackjack />
        </div>
      )}
    </div>
  );
}

function Roulette({ onRoundSettled }) {
  const { balanceCents, refresh, error: balanceError } = useWallet();
  const [placedBets, setPlacedBets] = useState({}); // { key: { type, value, stakeCents } }
  const [chipHistory, setChipHistory] = useState([]);
  const [recentNumbers, setRecentNumbers] = useState([]);
  const [selectedChip, setSelectedChip] = useState(5);
  const [spinning, setSpinning] = useState(false);
  const [pendingResult, setPendingResult] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const totalStakeCents = Object.values(placedBets).reduce((sum, b) => sum + b.stakeCents, 0);
  const overBalance = balanceCents !== null && totalStakeCents > balanceCents;
  const canPlay =
    !spinning && !balanceError && balanceCents !== null && totalStakeCents > 0 && !overBalance;

  function placeChip(key, betShape) {
    setResult(null);
    sound.playChip();
    setChipHistory((previous) => [...previous, { key, amount: selectedChip * 100 }]);
    setPlacedBets((prev) => {
      const existing = prev[key];
      const stakeCents = (existing?.stakeCents || 0) + selectedChip * 100;
      return { ...prev, [key]: { ...betShape, stakeCents } };
    });
  }

  function clearAll() {
    setPlacedBets({});
    setResult(null);
    setChipHistory([]);
  }

  function undoChip() {
    const last = chipHistory.at(-1);
    if (!last) return;
    setPlacedBets((previous) => {
      const next = { ...previous };
      const remaining = next[last.key].stakeCents - last.amount;
      if (remaining > 0) next[last.key] = { ...next[last.key], stakeCents: remaining };
      else delete next[last.key];
      return next;
    });
    setChipHistory((previous) => previous.slice(0, -1));
  }

  async function play() {
    if (!canPlay) return;
    setError('');
    setResult(null);
    setPendingResult(null);
    setSpinning(true);
    try {
      const bets = Object.values(placedBets).map((b) => ({
        type: b.type,
        value: b.value,
        stake_cents: b.stakeCents,
      }));
      const { round } = await api.playCasino({ game: 'roulette', bets });
      setPendingResult(round);
      await refresh().catch(() => {});
    } catch (err) {
      setError(err.message);
      setSpinning(false);
    }
  }

  function handleSettled() {
    if (!pendingResult) return;
    setSpinning(false);
    setResult(pendingResult);
    setPlacedBets({});
    setChipHistory([]);
    setRecentNumbers((previous) => [pendingResult.outcome, ...previous].slice(0, 12));
    onRoundSettled && onRoundSettled(pendingResult.payout_cents - pendingResult.stake_cents);
    if (pendingResult.payout_cents > pendingResult.stake_cents) sound.playWin();
    else sound.playLose();
  }

  const wonBets = result?.outcome.bets.filter((bet) => bet.won) || [];
  return (
    <div className="roulette-cabinet">
      <div className="table-game-heading">
        <div>
          <span className="slot-edition">LA MESA PALCO</span>
          <h2>Ruleta Europea</h2>
          <p>Un solo cero. Treinta y siete posibilidades.</p>
        </div>
        <span className="table-game-badge">
          37<span>Ruleta europea</span>
        </span>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <div className="roulette-stage">
        <div className="roulette-wheel-display">
          <RouletteWheel
            spinning={spinning}
            winningNumber={pendingResult?.outcome.winningNumber}
            onSettled={handleSettled}
          />
          <div className="roulette-wheel-caption">
            <span>EUROPEA</span>
            <span>UN SOLO CERO</span>
          </div>
        </div>
        <div className="roulette-summary">
          <div className="roulette-metrics">
            <div>
              <span>Tu saldo</span>
              <strong>{formatCents(balanceCents)}</strong>
            </div>
            <div>
              <span>Total en mesa</span>
              <strong>{formatCents(totalStakeCents)}</strong>
            </div>
          </div>
          <div className="roulette-round-status" role="status">
            {result ? (
              <>
                <span className={`roulette-result-chip is-${result.outcome.color}`}>
                  {result.outcome.winningNumber}
                </span>
                <div>
                  <strong>
                    {result.payout_cents > 0
                      ? `Premio de ${formatCents(result.payout_cents)}`
                      : 'Giro completado'}
                  </strong>
                  <span>
                    {result.outcome.color === 'red'
                      ? 'Rojo'
                      : result.outcome.color === 'black'
                        ? 'Negro'
                        : 'Verde'}
                    {wonBets.length ? ` · ${wonBets.length} apuestas ganadoras` : ''}
                  </span>
                </div>
              </>
            ) : (
              <div>
                <strong>
                  {spinning
                    ? 'La bola está en juego…'
                    : totalStakeCents
                      ? 'Tu apuesta está lista'
                      : 'Elige tus fichas y tu jugada'}
                </strong>
                <span>
                  {spinning
                    ? 'El resultado aparece cuando la rueda se detiene.'
                    : 'Cada ficha se suma a la casilla que elijas.'}
                </span>
              </div>
            )}
          </div>
          <button className="btn roulette-spin-button" onClick={play} disabled={!canPlay}>
            {spinning ? 'Girando…' : 'Girar ruleta'}
          </button>
          {overBalance && !spinning && (
            <p className="input-note" role="status">
              El total supera tu saldo de {formatCents(balanceCents)}. Reduce las fichas o{' '}
              <Link to="/wallet" className="text-gold">
                agrega saldo virtual
              </Link>
              .
            </p>
          )}
          <div className="roulette-recent">
            <span>Últimos números de esta mesa</span>
            <div>
              {recentNumbers.length ? (
                recentNumbers.map((outcome, index) => (
                  <span
                    key={index}
                    className={`roulette-result-chip is-${outcome.color}`}
                    aria-label={`${outcome.winningNumber}, ${outcome.color === 'red' ? 'rojo' : outcome.color === 'black' ? 'negro' : 'verde'}`}
                  >
                    {outcome.winningNumber}
                  </span>
                ))
              ) : (
                <small>Los resultados de tus giros aparecerán aquí.</small>
              )}
            </div>
          </div>
        </div>
      </div>
      <BettingTable
        placedBets={placedBets}
        onPlaceChip={placeChip}
        onClearAll={clearAll}
        selectedChip={selectedChip}
        onSelectChip={setSelectedChip}
        disabled={spinning}
        winningNumber={result?.outcome.winningNumber}
        onUndo={undoChip}
        canUndo={chipHistory.length > 0}
      />
      <details className="table-game-help">
        <summary>Cómo se juega a la ruleta</summary>
        <p>
          Selecciona una ficha y luego un número o una apuesta exterior. Un número paga 35:1;
          docenas y columnas, 2:1; rojo/negro, par/impar y mitades, 1:1. El cero solo gana al
          apostar al número 0. Deshacer retira la última ficha colocada; limpiar retira todas antes
          de girar.
        </p>
      </details>
    </div>
  );
}
