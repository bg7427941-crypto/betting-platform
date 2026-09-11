import { useEffect, useRef, useState } from 'react';
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
const AUTOPLAY_OPTIONS = [10, 25, 50, 100];
const AUTOPLAY_GAP_MS = 550;

// Se usan como respaldo mientras carga /api/casino/slots/config, para que no
// parpadeen los precios al entrar — deben coincidir con casino.service.js.
const DEFAULT_ANTE_TIERS = {
  none: { costMultiplier: 1, scatterBoost: 1 },
  ante25: { costMultiplier: 1.25, scatterBoost: 1.5 },
  ante50: { costMultiplier: 1.5, scatterBoost: 2 },
  ante100: { costMultiplier: 2, scatterBoost: 3 },
};
const DEFAULT_BUY_BONUS_MULTIPLIER = 100;
const ANTE_LABELS = { none: 'Normal', ante25: '+25%', ante50: '+50%', ante100: '+100%' };

function Slots() {
  const { balanceCents, refresh } = useWallet();
  const [stakeCents, setStakeCents] = useState(500);
  const [anteTier, setAnteTier] = useState('none');
  const [turbo, setTurbo] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [pendingRound, setPendingRound] = useState(null);
  const [round, setRound] = useState(null);
  const [error, setError] = useState('');
  const [showPaytable, setShowPaytable] = useState(false);
  const [dismissedBigWin, setDismissedBigWin] = useState(false);
  const [slotsConfig, setSlotsConfig] = useState(null);
  const [autoplayTotal, setAutoplayTotal] = useState(null); // null = no está en autoplay
  const [autoplayRemaining, setAutoplayRemaining] = useState(0);
  const autoplayRef = useRef(false);

  useEffect(() => {
    api.getSlotsConfig().then(setSlotsConfig).catch(() => {});
  }, []);

  const anteTiers = slotsConfig?.anteTiers || DEFAULT_ANTE_TIERS;
  const buyBonusMultiplier = slotsConfig?.buyBonusCostMultiplier ?? DEFAULT_BUY_BONUS_MULTIPLIER;

  const normalCostCents = Math.round(stakeCents * anteTiers[anteTier].costMultiplier);
  const buyBonusCostCents = Math.round(stakeCents * buyBonusMultiplier);

  async function spin({ buyBonus = false } = {}) {
    setSpinning(true);
    setError('');
    setRound(null);
    setPendingRound(null);
    setDismissedBigWin(false);
    try {
      const { round: newRound } = await api.playCasino({
        game: 'slots',
        stake_cents: stakeCents,
        buy_bonus: buyBonus,
        ante_tier: buyBonus ? 'none' : anteTier,
      });
      setPendingRound(newRound);
      await refresh();
    } catch (err) {
      setError(err.message);
      setSpinning(false);
      stopAutoplay();
    }
  }

  function startAutoplay(count) {
    setAutoplayTotal(count);
    setAutoplayRemaining(count);
    autoplayRef.current = true;
    spin();
  }

  function stopAutoplay() {
    autoplayRef.current = false;
    setAutoplayTotal(null);
    setAutoplayRemaining(0);
  }

  function handleSettled() {
    setSpinning(false);
    setRound(pendingRound);

    if (autoplayRef.current) {
      setAutoplayRemaining((prev) => {
        const next = prev - 1;
        const canContinue = next > 0 && balanceCents >= normalCostCents;
        if (canContinue) {
          setTimeout(() => {
            if (autoplayRef.current) spin();
          }, AUTOPLAY_GAP_MS);
        } else {
          autoplayRef.current = false;
          setAutoplayTotal(null);
        }
        return Math.max(next, 0);
      });
    }
  }

  const multiplier = round?.outcome.multiplier || 0;
  const isBigWin = round && multiplier >= BIG_WIN_MULTIPLIER && !dismissedBigWin;
  const isAutoplaying = autoplayTotal !== null;
  const canAffordNormal = balanceCents >= normalCostCents;
  const canAffordBonus = balanceCents >= buyBonusCostCents;

  return (
    <div className="slot-cabinet">
      {error && <div className="error-banner">{error}</div>}

      <div className="slot-marquee">
        <div className="slot-marquee-bulbs">
          {Array.from({ length: 14 }).map((_, i) => (
            <span key={i} className="slot-bulb" style={{ animationDelay: `${(i % 7) * 0.12}s` }} />
          ))}
        </div>
        <div className="slot-title">Corona Real</div>
        <div className="slot-subtitle">5 carriles · 10 líneas · comodín y scatter</div>
      </div>

      <div style={{ position: 'relative' }}>
        <SlotMachine spinning={spinning} result={pendingRound?.outcome} turbo={turbo} onSettled={handleSettled} />

        {isBigWin && (
          <div className="slot-bigwin-overlay">
            <div className="slot-bigwin-burst" />
            {Array.from({ length: 10 }).map((_, i) => (
              <span
                key={i}
                className="slot-bigwin-sparkle"
                style={{ left: `${8 + i * 9}%`, animationDelay: `${(i % 5) * 0.15}s` }}
              >
                {i % 2 === 0 ? '✦' : '✧'}
              </span>
            ))}
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

        <button
          type="button"
          className={`slot-turbo-toggle ${turbo ? 'active' : ''}`}
          onClick={() => setTurbo((v) => !v)}
          disabled={spinning}
          title="Giro rápido"
        >
          ⚡ Turbo
        </button>

        {isAutoplaying ? (
          <button className="btn-ghost slot-spin-btn" onClick={stopAutoplay}>
            Detener ({autoplayRemaining})
          </button>
        ) : (
          <button className="btn slot-spin-btn" onClick={() => spin()} disabled={spinning || !canAffordNormal}>
            {spinning ? 'Girando…' : `Girar · ${formatCents(normalCostCents)}`}
          </button>
        )}
      </div>

      <div className="slot-ante-row">
        <span className="text-sage slot-ante-label">Apuesta ante (más chance de scatter):</span>
        {Object.keys(anteTiers).map((key) => (
          <button
            key={key}
            className={`slot-ante-btn ${anteTier === key ? 'selected' : ''}`}
            onClick={() => setAnteTier(key)}
            disabled={spinning || isAutoplaying}
          >
            {ANTE_LABELS[key]}
          </button>
        ))}
      </div>

      <div className="slot-buy-bonus-row">
        <button
          className="slot-buy-bonus-btn"
          onClick={() => spin({ buyBonus: true })}
          disabled={spinning || isAutoplaying || !canAffordBonus}
        >
          <span>💰 Comprar bono (scatter garantizado)</span>
          <span className="mono">{formatCents(buyBonusCostCents)}</span>
        </button>
      </div>

      {!isAutoplaying && (
        <div className="slot-autoplay-row">
          <span className="text-sage" style={{ fontSize: 12 }}>
            Autoplay:
          </span>
          {AUTOPLAY_OPTIONS.map((n) => (
            <button
              key={n}
              className="btn-ghost slot-autoplay-btn"
              onClick={() => startAutoplay(n)}
              disabled={spinning || !canAffordNormal}
            >
              {n}×
            </button>
          ))}
        </div>
      )}

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
