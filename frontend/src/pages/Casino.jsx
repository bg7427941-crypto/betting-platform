import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useWallet, formatCents } from '../context/WalletContext';
import { RouletteWheel } from '../components/RouletteWheel';
import { BettingTable } from '../components/BettingTable';
import { SlotMachine, SLOT_PAYTABLE } from '../components/SlotMachine';
import BlackjackTable from '../components/BlackjackTable';
import LiveBlackjack from '../components/LiveBlackjack';

function formatElapsed(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function Casino() {
  const [tab, setTab] = useState('roulette');
  // Contador de sesión: cuánto tiempo llevás jugando y el neto acumulado
  // (ganado - apostado) desde que entraste a esta pantalla. Vive acá, no en
  // Roulette/Slots, porque esos se re-montan al cambiar de tab (key={tab})
  // y perderían el acumulado; cada uno avisa sus rondas vía onRoundSettled.
  const sessionStartRef = useRef(Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [sessionNetCents, setSessionNetCents] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - sessionStartRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  function handleRoundSettled(netCents) {
    setSessionNetCents((prev) => prev + netCents);
  }

  return (
    <div>
      <h1 className="page-title">Casino</h1>
      <p className="page-sub">Ruleta y tragamonedas. Saldo virtual — modo demo.</p>

      <div className="session-tracker">
        <span>
          Sesión: <span className="mono">{formatElapsed(elapsedSeconds)}</span>
        </span>
        <span>
          Neto:{' '}
          <span
            className={`mono ${
              sessionNetCents > 0 ? 'text-gold' : sessionNetCents < 0 ? 'text-brick' : 'text-sage'
            }`}
          >
            {sessionNetCents > 0 ? '+' : ''}
            {formatCents(sessionNetCents)}
          </span>
        </span>
      </div>

      <div className="casino-tabs">
        <button
          className={tab === 'roulette' ? 'btn' : 'btn-ghost'}
          onClick={() => setTab('roulette')}
        >
          Ruleta
        </button>
        <button className={tab === 'slots' ? 'btn' : 'btn-ghost'} onClick={() => setTab('slots')}>
          Tragamonedas
        </button>
        <button className={tab === 'blackjack' ? 'btn' : 'btn-ghost'} onClick={() => setTab('blackjack')}>
          Blackjack (práctica)
        </button>
        <button className={tab === 'live' ? 'btn' : 'btn-ghost'} onClick={() => setTab('live')}>
          Blackjack en vivo
        </button>
      </div>

      {tab === 'roulette' && (
        <div key="roulette" className="casino-tab-panel">
          <Roulette onRoundSettled={handleRoundSettled} />
        </div>
      )}
      {tab === 'slots' && (
        <div key="slots" className="casino-tab-panel">
          <Slots onRoundSettled={handleRoundSettled} />
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
    onRoundSettled && onRoundSettled(pendingResult.payout_cents - pendingResult.stake_cents);
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
                  <span className="roulette-win-line">
                    <svg
                      key={result.payout_cents /* re-dispara el pop-in en cada victoria nueva */}
                      className="roulette-win-chip"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle cx="12" cy="12" r="10" stroke="var(--gold)" strokeWidth="1.5" />
                      <circle cx="12" cy="12" r="5.5" stroke="var(--gold)" strokeWidth="1.5" />
                      <path
                        d="M12 2v3.2M12 18.8V22M22 12h-3.2M5.2 12H2M19.07 4.93l-2.26 2.26M7.19 16.81l-2.26 2.26M19.07 19.07l-2.26-2.26M7.19 7.19L4.93 4.93"
                        stroke="var(--gold)"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="text-gold">Ganaste {formatCents(result.payout_cents)}</span>
                  </span>
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
  ante25: { costMultiplier: 1.25, scatterBoost: 1.72 },
  ante50: { costMultiplier: 1.5, scatterBoost: 2.13 },
  ante100: { costMultiplier: 2, scatterBoost: 2.66 },
};
// Deben coincidir con casino.service.js.
const DEFAULT_BUY_BONUS_MULTIPLIER = 28;
const ANTE_LABELS = { none: 'Normal', ante25: '+25%', ante50: '+50%', ante100: '+100%' };

function Slots({ onRoundSettled }) {
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
  const pendingRoundRef = useRef(null); // guarda el round que disparó el bono, sin re-alimentar displayResult

  // --- reproducción del bono de giros gratis (backend ya jugó toda la
  // ronda de una vez; acá solo la vamos revelando giro por giro) ---
  const [bonusActive, setBonusActive] = useState(false);
  const [bonusSpins, setBonusSpins] = useState([]);
  const [bonusIndex, setBonusIndex] = useState(0);
  const [bonusInfo, setBonusInfo] = useState(null); // { bonusMultiplier, triggerScatterCount }
  const [bonusRunningCents, setBonusRunningCents] = useState(0);
  const [bonusSpinning, setBonusSpinning] = useState(false);
  const [bonusRetriggerFlash, setBonusRetriggerFlash] = useState(false);
  // Momento de "entrada" (se revela el multiplicador y la cantidad de giros
  // antes de tirar el primer carrete) y de "cierre" (se cuenta el total
  // acumulado antes de volver al juego base) — sin esto el bono se sentía
  // como una tanda de giros más, sin arranque ni remate.
  const [bonusIntroVisible, setBonusIntroVisible] = useState(false);
  const [bonusOutroVisible, setBonusOutroVisible] = useState(false);
  const [bonusOutroTotalCents, setBonusOutroTotalCents] = useState(0);
  const [bonusOutroDisplayCents, setBonusOutroDisplayCents] = useState(0);
  const stakeAtBonusStart = useRef(0);
  const bonusTimers = useRef([]);
  const bonusIntroTimer = useRef(null);
  const bonusOutroTimer = useRef(null);

  useEffect(() => {
    api.getSlotsConfig().then(setSlotsConfig).catch(() => {});
  }, []);

  useEffect(() => () => bonusTimers.current.forEach(clearTimeout), []);

  // Cuenta el total del bono desde 0 hasta el monto final, en vez de
  // mostrarlo ya calculado — es lo que hace que el cierre se sienta como
  // un resultado, no como un dato que ya estaba ahí.
  useEffect(() => {
    if (!bonusOutroVisible) {
      setBonusOutroDisplayCents(0);
      return;
    }
    const durationMs = turbo ? 500 : 1100;
    const startTime = performance.now();
    let frame;
    function tick(now) {
      const t = Math.min(1, (now - startTime) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cúbico
      setBonusOutroDisplayCents(Math.round(bonusOutroTotalCents * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [bonusOutroVisible, bonusOutroTotalCents, turbo]);

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

  // continúa el autoplay (si corresponde) después de que un resultado ya
  // quedó totalmente revelado — se llama tanto tras un giro normal como
  // tras terminar de reproducir un bono.
  function continueAutoplayIfNeeded() {
    if (!autoplayRef.current) return;
    setAutoplayRemaining((prev) => {
      const next = prev - 1;
      const canContinue = next > 0 && balanceCents >= normalCostCents;
      if (canContinue) {
        const t = setTimeout(() => {
          if (autoplayRef.current) spin();
        }, AUTOPLAY_GAP_MS);
        bonusTimers.current.push(t);
      } else {
        autoplayRef.current = false;
        setAutoplayTotal(null);
      }
      return Math.max(next, 0);
    });
  }

  function handleSettled() {
    if (pendingRound?.outcome.bonus) {
      // Guardamos el round en un ref (para revelarlo al final) y limpiamos
      // el estado `pendingRound` — si lo dejáramos, al terminar el bono
      // volvería a ser el `result` de la tragamonedas, se vería como "llegó
      // un resultado nuevo", se re-animaría, y eso re-detectaría el bono y
      // arrancaría todo de nuevo (el bucle que se repetía 2-3 veces).
      pendingRoundRef.current = pendingRound;
      stakeAtBonusStart.current = stakeCents;
      setBonusInfo({
        bonusMultiplier: pendingRound.outcome.bonus.bonusMultiplier,
        triggerScatterCount: pendingRound.outcome.bonus.triggerScatterCount,
      });
      setBonusSpins(pendingRound.outcome.bonus.spins);
      setBonusIndex(0);
      setBonusRunningCents(0);
      setPendingRound(null);
      // No arrancamos los giros todavía: primero se anuncia el bono
      // (cuántos giros, qué multiplicador) y recién con eso — o con el
      // click de "Empezar" — se dispara la cascada de carretes.
      setBonusIntroVisible(true);
      const introMs = turbo ? 900 : 2000;
      const t = setTimeout(() => startBonusSpins(), introMs);
      bonusIntroTimer.current = t;
      bonusTimers.current.push(t);
      return;
    }

    setSpinning(false);
    setRound(pendingRound);
    onRoundSettled && onRoundSettled(pendingRound.payout_cents - pendingRound.stake_cents);
    continueAutoplayIfNeeded();
  }

  function startBonusSpins() {
    if (bonusIntroTimer.current) clearTimeout(bonusIntroTimer.current);
    setBonusIntroVisible(false);
    setBonusActive(true);
    setBonusSpinning(true);
  }

  function handleBonusSpinSettled() {
    const currentSpin = bonusSpins[bonusIndex];
    const spinPayoutCents = Math.round(currentSpin.payoutMultiplier * stakeAtBonusStart.current);
    // Se necesita el total ya sumado (no el viejo `bonusRunningCents`, que
    // recién se actualiza en el próximo render) para poder pasárselo al
    // cierre del bono si este era el último giro.
    const newRunningCents = bonusRunningCents + spinPayoutCents;
    setBonusRunningCents(newRunningCents);

    if (currentSpin.retriggerAmount > 0) {
      setBonusRetriggerFlash(true);
      const flashTimer = setTimeout(() => setBonusRetriggerFlash(false), 1400);
      bonusTimers.current.push(flashTimer);
    }

    const nextIndex = bonusIndex + 1;
    const pauseMs = turbo ? 260 : 550;

    if (nextIndex < bonusSpins.length) {
      const t = setTimeout(() => {
        setBonusIndex(nextIndex);
        setBonusSpinning(true);
      }, pauseMs);
      bonusTimers.current.push(t);
    } else {
      const t = setTimeout(() => {
        setBonusActive(false);
        setBonusSpinning(false);
        // Cierre del bono: se muestra el total acumulado contándose hacia
        // arriba antes de volver al juego base (ver finishBonusOutro).
        setBonusOutroTotalCents(newRunningCents);
        setBonusOutroVisible(true);
        const outroMs = turbo ? 1200 : 2400;
        const outroTimer = setTimeout(() => finishBonusOutro(), outroMs);
        bonusOutroTimer.current = outroTimer;
        bonusTimers.current.push(outroTimer);
      }, pauseMs);
      bonusTimers.current.push(t);
    }
  }

  function finishBonusOutro() {
    if (bonusOutroTimer.current) clearTimeout(bonusOutroTimer.current);
    setBonusOutroVisible(false);
    setSpinning(false);
    setRound(pendingRoundRef.current); // el round guardado, con el pago total ya calculado por el backend
    onRoundSettled &&
      onRoundSettled(pendingRoundRef.current.payout_cents - pendingRoundRef.current.stake_cents);
    continueAutoplayIfNeeded();
  }

  const multiplier = round?.outcome.multiplier || 0;
  const isBigWin = round && multiplier >= BIG_WIN_MULTIPLIER && !dismissedBigWin;
  const isAutoplaying = autoplayTotal !== null;
  const canAffordNormal = balanceCents >= normalCostCents;
  const canAffordBonus = balanceCents >= buyBonusCostCents;

  const displayResult = bonusActive ? bonusSpins[bonusIndex] : pendingRound?.outcome;
  const displaySpinning = bonusActive ? bonusSpinning : spinning;
  const displayOnSettled = bonusActive ? handleBonusSpinSettled : handleSettled;

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

      {bonusActive && bonusInfo && (
        <div className="slot-bonus-bar">
          <div>
            <span className="text-gold">🎁 Bono de giros gratis</span>
            <span className="text-sage" style={{ marginLeft: 8 }}>
              multiplicador ×{bonusInfo.bonusMultiplier}
            </span>
          </div>
          <div className="mono">
            Giro {bonusIndex + 1}/{bonusSpins.length} · Acumulado{' '}
            <span className="text-gold">{formatCents(bonusRunningCents)}</span>
          </div>
        </div>
      )}

      {bonusRetriggerFlash && <div className="slot-retrigger-flash">¡Re-disparo! Más giros gratis</div>}

      <div style={{ position: 'relative' }}>
        <SlotMachine
          spinning={displaySpinning}
          result={displayResult}
          turbo={bonusActive ? true : turbo}
          onSettled={displayOnSettled}
        />

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
            <button className="btn slot-bigwin-dismiss" onClick={() => setDismissedBigWin(true)}>              Continuar
            </button>
          </div>
        )}

        {bonusIntroVisible && bonusInfo && (
          <div className="slot-bonus-intro-overlay">
            <div className="slot-bonus-intro-ring" />
            <div className="slot-bonus-intro-kicker">
              {bonusInfo.triggerScatterCount}× 💰 — ¡bono activado!
            </div>
            <div className="slot-bonus-intro-title">GIROS GRATIS</div>
            <div className="slot-bonus-intro-detail">
              <span className="mono">{bonusSpins.length}</span> giros · multiplicador{' '}
              <span className="mono">×{bonusInfo.bonusMultiplier}</span>
            </div>
            <button className="btn slot-bonus-intro-start" onClick={startBonusSpins}>
              Empezar
            </button>
          </div>
        )}

        {bonusOutroVisible && (
          <div className="slot-bonus-outro-overlay">
            <div className="slot-bonus-outro-kicker">Bono terminado</div>
            <div className="slot-bonus-outro-amount mono">{formatCents(bonusOutroDisplayCents)}</div>
            <button className="btn slot-bonus-outro-continue" onClick={finishBonusOutro}>
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
          <button className="btn-ghost slot-spin-btn slot-autoplay-active" onClick={stopAutoplay}>
            <span className="slot-autoplay-dot" />
            Detener ({autoplayRemaining})
          </button>
        ) : (
          <button className="btn slot-spin-btn" onClick={() => spin()} disabled={spinning || !canAffordNormal}>
            {bonusActive || bonusIntroVisible || bonusOutroVisible
              ? 'En bono…'
              : spinning
              ? 'Girando…'
              : `Girar · ${formatCents(normalCostCents)}`}
          </button>
        )}
      </div>

      {isAutoplaying && (
        <div className="slot-autoplay-progress-track">
          <div
            className="slot-autoplay-progress-fill"
            style={{ width: `${((autoplayTotal - autoplayRemaining) / autoplayTotal) * 100}%` }}
          />
        </div>
      )}

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
              ({round.outcome.scatterCount} símbolos scatter)
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
