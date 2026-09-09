import { useState } from 'react';
import { api } from '../api/client';
import { useWallet, formatCents } from '../context/WalletContext';
import { RouletteWheel } from '../components/RouletteWheel';

const ROULETTE_BETS = [
  { type: 'red', label: 'Rojo' },
  { type: 'black', label: 'Negro' },
  { type: 'even', label: 'Par' },
  { type: 'odd', label: 'Impar' },
  { type: 'low', label: '1–18' },
  { type: 'high', label: '19–36' },
];

export default function Casino() {
  const [tab, setTab] = useState('roulette');

  return (
    <div>
      <h1 className="page-title">Casino</h1>
      <p className="page-sub">Ruleta y tragamonedas. Saldo virtual — modo demo.</p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <button
          className={tab === 'roulette' ? 'btn' : 'btn-ghost'}
          onClick={() => setTab('roulette')}
        >
          Ruleta
        </button>
        <button className={tab === 'slots' ? 'btn' : 'btn-ghost'} onClick={() => setTab('slots')}>
          Tragamonedas
        </button>
      </div>

      {tab === 'roulette' ? <Roulette /> : <Slots />}
    </div>
  );
}

function Roulette() {
  const { refresh } = useWallet();
  const [stake, setStake] = useState('5');
  const [betType, setBetType] = useState('red');
  const [spinning, setSpinning] = useState(false);
  const [pendingResult, setPendingResult] = useState(null); // llegó del server, pero la rueda sigue frenando
  const [result, setResult] = useState(null); // ya se puede mostrar (rueda ya frenó)
  const [error, setError] = useState('');

  async function play() {
    setError('');
    setResult(null);
    setPendingResult(null);
    setSpinning(true);
    try {
      const stakeCents = Math.round(Number(stake) * 100);
      const { round } = await api.playCasino({
        game: 'roulette',
        stake_cents: stakeCents,
        bet: { type: betType },
      });
      setPendingResult(round); // dispara el frenado de la rueda hacia este número
      await refresh();
    } catch (err) {
      setError(err.message);
      setSpinning(false);
    }
  }

  function handleSettled() {
    setSpinning(false);
    setResult(pendingResult);
  }

  return (
    <div className="panel" style={{ maxWidth: 480 }}>
      {error && <div className="error-banner">{error}</div>}

      <RouletteWheel
        spinning={spinning}
        winningNumber={pendingResult?.outcome.winningNumber}
        onSettled={handleSettled}
      />

      <div className="field" style={{ marginTop: 20 }}>
        <label>Apuesta</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {ROULETTE_BETS.map((b) => (
            <button
              key={b.type}
              className={`odds-btn ${betType === b.type ? 'selected' : ''}`}
              onClick={() => setBetType(b.type)}
              disabled={spinning}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field" style={{ maxWidth: 160 }}>
        <label htmlFor="rstake">Monto (PEN)</label>
        <input
          id="rstake"
          type="number"
          min="1"
          value={stake}
          onChange={(e) => setStake(e.target.value)}
          disabled={spinning}
        />
      </div>

      <button className="btn" onClick={play} disabled={spinning}>
        {spinning ? 'Girando…' : 'Girar ruleta'}
      </button>

      {result && (
        <>
          <hr className="divider" />
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }} className="result-reveal">
            <span className="mono" style={{ fontSize: 32 }}>
              {result.outcome.winningNumber}
            </span>
            <span
              className={
                result.outcome.color === 'red'
                  ? 'text-brick'
                  : result.outcome.color === 'black'
                  ? 'text-sage'
                  : 'text-gold'
              }
              style={{ textTransform: 'capitalize' }}
            >
              {result.outcome.color === 'red' ? 'rojo' : result.outcome.color === 'black' ? 'negro' : 'verde'}
            </span>
          </div>
          <div style={{ marginTop: 6 }}>
            {result.outcome.won ? (
              <span className="text-gold">Ganaste {formatCents(result.payout_cents)}</span>
            ) : (
              <span className="text-sage">Sin suerte esta vez</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Slots() {
  const { refresh } = useWallet();
  const [stake, setStake] = useState('5');
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [displayReels, setDisplayReels] = useState(['❔', '❔', '❔']);

  async function play() {
    setSpinning(true);
    setError('');
    setResult(null);

    const stakeCents = Math.round(Number(stake) * 100);
    const apiCall = api.playCasino({ game: 'slots', stake_cents: stakeCents });

    // los tres rodillos frenan escalonados, para que se sienta el giro
    const stopDelays = [1200, 1600, 2000];

    try {
      const { round } = await apiCall;
      stopDelays.forEach((delay, i) => {
        setTimeout(() => {
          setDisplayReels((prev) => {
            const next = [...prev];
            next[i] = round.outcome.reels[i];
            return next;
          });
          if (i === stopDelays.length - 1) {
            setTimeout(() => {
              setResult(round);
              setSpinning(false);
            }, 200);
          }
        }, delay);
      });
      await refresh();
    } catch (err) {
      setError(err.message);
      setSpinning(false);
    }
  }

  return (
    <div className="panel" style={{ maxWidth: 420 }}>
      {error && <div className="error-banner">{error}</div>}

      <div className="reel-window">
        {displayReels.map((s, i) => (
          <div key={i} className="reel-slot">
            <span className={spinning ? 'reel-spinning' : 'reel-symbol'}>{s}</span>
          </div>
        ))}
      </div>

      <div className="field" style={{ maxWidth: 160 }}>
        <label htmlFor="sstake">Monto (PEN)</label>
        <input
          id="sstake"
          type="number"
          min="1"
          value={stake}
          onChange={(e) => setStake(e.target.value)}
          disabled={spinning}
        />
      </div>

      <button className="btn" onClick={play} disabled={spinning}>
        {spinning ? 'Girando…' : 'Girar rodillos'}
      </button>

      {result && (
        <div style={{ marginTop: 14 }} className="result-reveal">
          {result.outcome.won ? (
            <span className="text-gold">Ganaste {formatCents(result.payout_cents)}</span>
          ) : (
            <span className="text-sage">Sin suerte esta vez</span>
          )}
        </div>
      )}
    </div>
  );
}