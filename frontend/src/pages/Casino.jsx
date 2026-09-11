import { useState } from 'react';
import { api } from '../api/client';
import { useWallet, formatCents } from '../context/WalletContext';
import { RouletteWheel } from '../components/RouletteWheel';
import { BettingTable } from '../components/BettingTable';
import { SlotMachine, SLOT_PAYTABLE } from '../components/SlotMachine';

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

const BET_STEP_CENTS = 100; // S/1
const MIN_STAKE_CENTS = 100; // S/1
const BIG_WIN_MULTIPLIER = 15; // a partir de acá se muestra el banner de premio grande

function Slots() {
  const { refresh } = useWallet();
  const [stakeCents, setStakeCents] = useState(500);
  const [spinning, setSpinning] = useState(false);
  const [pendingRound, setPendingRound] = useState(null);
  const [round, setRound] = useState(null);
  const [error, setError] = useState('');
  const [showPaytable, setShowPaytable] = useState(false);
  const [dismissedBigWin, setDismissedBigWin] = useState(false);

  async function play() {
    setSpinning(true);
    setError('');
    setRound(null);
    setPendingRound(null);
    setDismissedBigWin(false);
    try {
      const { round: newRound } = await api.playCasino({ game: 'slots', stake_cents: stakeCents });
      setPendingRound(newRound);
      await refresh();
    } catch (err) {
      setError(err.message);
      setSpinning(false);
    }
  }

  function handleSettled() {
    setSpinning(false);
    setRound(pendingRound);
  }

  const multiplier = round?.outcome.multiplier || 0;
  const isBigWin = round && multiplier >= BIG_WIN_MULTIPLIER && !dismissedBigWin;

  return (
    <div className="slot-cabinet">
      {error && <div className="error-banner">{error}</div>}

      <div className="slot-marquee">
        <div className="slot-title">Corona Real</div>
        <div className="slot-subtitle">5 carriles · 10 líneas · comodín y scatter</div>
      </div>

      <div style={{ position: 'relative' }}>
        <SlotMachine spinning={spinning} result={pendingRound?.outcome} onSettled={handleSettled} />

        {isBigWin && (
          <div className="slot-bigwin-overlay">
            <div className="slot-bigwin-label">
              {multiplier >= 80 ? '¡Premio mayor!' : '¡Gran premio!'}
            </div>
            <div className="slot-bigwin-amount">{formatCents(round.payout_cents)}</div>
            <button className="btn slot-bigwin-dismiss" onClick={() => setDismissedBigWin(true)}>
              Continuar
            </button>
          </div>
        )}
      </div>

      <div className="slot-controls">
        <div className="slot-bet-stepper">
          <button
            type="button"
            onClick={() => setStakeCents((c) => Math.max(MIN_STAKE_CENTS, c - BET_STEP_CENTS))}
            disabled={spinning || stakeCents <= MIN_STAKE_CENTS}
          >
            −
          </button>
          <span className="slot-bet-value mono">{formatCents(stakeCents)}</span>
          <button
            type="button"
            onClick={() => setStakeCents((c) => c + BET_STEP_CENTS)}
            disabled={spinning}
          >
            +
          </button>
        </div>
        <button className="btn slot-spin-btn" onClick={play} disabled={spinning}>
          {spinning ? 'Girando…' : 'Girar'}
        </button>
      </div>

      {round && !isBigWin && (
        <div className="result-reveal" style={{ marginTop: 12 }}>
          {round.outcome.won ? (
            <span className="text-gold">Ganaste {formatCents(round.payout_cents)}</span>
          ) : (
            <span className="text-sage">Sin suerte esta vez</span>
          )}
          {round.outcome.scatterCount >= 2 && round.outcome.scatterCount < 3 && (
            <span className="text-sage" style={{ marginLeft: 8, fontSize: 12 }}>
              (2 símbolos de scatter — a un paso del premio)
            </span>
          )}
        </div>
      )}

      <div className="slot-readout-row">
        <span>Apostado por línea</span>
        <span className="slot-readout-value">{formatCents(Math.round(stakeCents / 10))} × 10</span>
      </div>

      <button className="slot-paytable-toggle" onClick={() => setShowPaytable((v) => !v)}>
        {showPaytable ? 'Ocultar tabla de pagos' : 'Ver tabla de pagos'}
      </button>

      {showPaytable && (
        <div className="slot-paytable">
          {SLOT_PAYTABLE.map((row) => (
            <div className="slot-paytable-row" key={row.symbol}>
              <span className="slot-paytable-symbol">{row.symbol}</span>
              <span className="slot-paytable-values">{row.values}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
