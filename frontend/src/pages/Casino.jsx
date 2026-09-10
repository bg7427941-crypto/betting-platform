import { useState } from 'react';
import { api } from '../api/client';
import { useWallet, formatCents } from '../context/WalletContext';
import { RouletteWheel } from '../components/RouletteWheel';
import { BettingTable } from '../components/BettingTable';

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
  const [placedBets, setPlacedBets] = useState({}); // { key: { type, value, stakeCents } }
  const [selectedChip, setSelectedChip] = useState(5);
  const [spinning, setSpinning] = useState(false);
  const [pendingResult, setPendingResult] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const totalStakeCents = Object.values(placedBets).reduce((sum, b) => sum + b.stakeCents, 0);

  function placeChip(key, betShape) {
    setResult(null);
    setPlacedBets((prev) => {
      const existing = prev[key];
      const stakeCents = (existing?.stakeCents || 0) + selectedChip * 100;
      return { ...prev, [key]: { ...betShape, stakeCents } };
    });
  }

  function clearAll() {
    setPlacedBets({});
    setResult(null);
  }

  async function play() {
    if (totalStakeCents === 0) return;
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
      await refresh();
    } catch (err) {
      setError(err.message);
      setSpinning(false);
    }
  }

  function handleSettled() {
    setSpinning(false);
    setResult(pendingResult);
    setPlacedBets({});
  }

  const wonBets = result?.outcome.bets.filter((b) => b.won) || [];

  return (
    <div className="panel" style={{ maxWidth: 900 }}>
      {error && <div className="error-banner">{error}</div>}

      <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
        <RouletteWheel
          spinning={spinning}
          winningNumber={pendingResult?.outcome.winningNumber}
          onSettled={handleSettled}
        />

        <div style={{ flex: 1, minWidth: 280 }}>
          <div className="text-sage" style={{ fontSize: 13, marginBottom: 4 }}>
            Total en mesa
          </div>
          <div className="mono text-gold" style={{ fontSize: 24, marginBottom: 16 }}>
            {formatCents(totalStakeCents)}
          </div>

          <button className="btn" onClick={play} disabled={spinning || totalStakeCents === 0} style={{ width: '100%' }}>
            {spinning ? 'Girando…' : 'Girar ruleta'}
          </button>

          {result && (
            <div className="result-reveal" style={{ marginTop: 16 }}>
              <hr className="divider" />
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
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
                {result.payout_cents > 0 ? (
                  <span className="text-gold">Ganaste {formatCents(result.payout_cents)}</span>
                ) : (
                  <span className="text-sage">Sin suerte esta vez</span>
                )}
              </div>
              {wonBets.length > 0 && (
                <div className="text-sage" style={{ fontSize: 12, marginTop: 6 }}>
                  {wonBets.length} de tus {result.outcome.bets.length} apuestas ganaron
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <hr className="divider" />

      <BettingTable
        placedBets={placedBets}
        onPlaceChip={placeChip}
        onClearAll={clearAll}
        selectedChip={selectedChip}
        onSelectChip={setSelectedChip}
        disabled={spinning}
        winningNumber={result?.outcome.winningNumber}
      />
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
