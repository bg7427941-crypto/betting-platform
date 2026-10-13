import { useEffect, useId, useRef, useState } from 'react';
import { api } from '../api/client';
import { useWallet, formatCents } from '../context/WalletContext';
import { SlotMachine, SLOT_PAYTABLE } from './SlotMachine';
import { SlotArtwork, SlotSymbol } from './SlotArtwork';
import Icon from './Icon';
import AnimatedAmount from './AnimatedAmount';
import * as sound from '../lib/sound';

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
const ANTE_LABELS = {
  none: 'Normal',
  ante25: '+25%',
  ante50: '+50%',
  ante100: '+100%',
};

export default function SlotsGame({ onRoundSettled }) {
  const { balanceCents, refresh } = useWallet();
  const artworkId = `corona-${useId().replaceAll(':', '')}`;
  const [stakeCents, setStakeCents] = useState(500);
  const [anteTier, setAnteTier] = useState('none');
  const [turbo, setTurbo] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [pendingRound, setPendingRound] = useState(null);
  const [round, setRound] = useState(null);
  const [error, setError] = useState('');
  const [showPaytable, setShowPaytable] = useState(false);
  const [lastPayoutCents, setLastPayoutCents] = useState(0);
  const [dismissedBigWin, setDismissedBigWin] = useState(false);
  const [slotsConfig, setSlotsConfig] = useState(null);
  const [slotMode, setSlotMode] = useState('classic');
  const [cascadeActive, setCascadeActive] = useState(false);
  const [cascadeIndex, setCascadeIndex] = useState(0);
  const [cascadeAnimating, setCascadeAnimating] = useState(false);
  const cascadePlayed = useRef(false);
  const [bonusAuto, setBonusAuto] = useState(true);
  const [bonusNextIndex, setBonusNextIndex] = useState(null);
  const [recentRounds, setRecentRounds] = useState([]);
  const reportedRound = useRef(null);
  const [autoplayTotal, setAutoplayTotal] = useState(null); // null = no está en autoplay
  const [autoplayRemaining, setAutoplayRemaining] = useState(0);
  const autoplayRef = useRef(false);
  const autoplayRemainingRef = useRef(0);
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
  const stakeAtBonusStart = useRef(0);
  const bonusTimers = useRef([]);
  const bonusIntroTimer = useRef(null);
  const bonusOutroTimer = useRef(null);

  useEffect(() => {
    api
      .getSlotsConfig()
      .then(setSlotsConfig)
      .catch(() => {});
  }, []);

  useEffect(() => () => bonusTimers.current.forEach(clearTimeout), []);

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
    cascadePlayed.current = false;
    setCascadeActive(false);
    setCascadeIndex(0);
    setBonusNextIndex(null);
    try {
      const { round: newRound } = await api.playCasino({
        game: 'slots',
        stake_cents: stakeCents,
        buy_bonus: buyBonus,
        ante_tier: buyBonus ? 'none' : anteTier,
        slot_mode: slotMode,
      });
      setPendingRound(newRound);
      await refresh().catch(() => {});
    } catch (err) {
      setError(err.message);
      setSpinning(false);
      stopAutoplay();
    }
  }

  function startAutoplay(count) {
    setAutoplayTotal(count);
    setAutoplayRemaining(count);
    autoplayRemainingRef.current = count;
    autoplayRef.current = true;
    spin();
  }

  function stopAutoplay() {
    autoplayRef.current = false;
    setAutoplayTotal(null);
    setAutoplayRemaining(0);
    autoplayRemainingRef.current = 0;
  }

  // continúa el autoplay (si corresponde) después de que un resultado ya
  // quedó totalmente revelado — se llama tanto tras un giro normal como
  // tras terminar de reproducir un bono.
  function continueAutoplayIfNeeded() {
    if (!autoplayRef.current) return;
    const next = Math.max(0, autoplayRemainingRef.current - 1);
    autoplayRemainingRef.current = next;
    setAutoplayRemaining(next);
    if (next > 0 && balanceCents >= normalCostCents) {
      const timer = setTimeout(() => {
        if (autoplayRef.current) spin();
      }, AUTOPLAY_GAP_MS);
      bonusTimers.current.push(timer);
    } else {
      autoplayRef.current = false;
      setAutoplayTotal(null);
    }
  }

  function handleSettled() {
    if (!pendingRound) return;
    const frames = pendingRound.outcome.cascades;
    if (frames?.length > 1 && !cascadePlayed.current) {
      cascadePlayed.current = true;
      setCascadeActive(true);
      setCascadeIndex(0);
      setCascadeAnimating(false);
      const timer = setTimeout(
        () => {
          setCascadeIndex(1);
          setCascadeAnimating(true);
        },
        turbo ? 350 : 750
      );
      bonusTimers.current.push(timer);
      return;
    }
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
      sound.playBlackjack();
      const introMs = turbo ? 900 : 2000;
      const t = setTimeout(() => startBonusSpins(), introMs);
      bonusIntroTimer.current = t;
      bonusTimers.current.push(t);
      return;
    }

    completeRound(pendingRound);
  }

  function completeRound(completed) {
    if (!completed || reportedRound.current === completed.id) return;
    reportedRound.current = completed.id;
    setSpinning(false);
    setCascadeActive(false);
    setRound(completed);
    setLastPayoutCents(completed.payout_cents);
    setRecentRounds((previous) => [completed, ...previous].slice(0, 8));
    onRoundSettled?.(completed.payout_cents - completed.stake_cents);
    if (completed.payout_cents > completed.stake_cents) {
      if (completed.outcome.multiplier >= BIG_WIN_MULTIPLIER) sound.playBlackjack();
      else sound.playWin();
    } else {
      sound.playLose();
    }
    continueAutoplayIfNeeded();
  }

  function handleCascadeSettled() {
    setCascadeAnimating(false);
    const next = cascadeIndex + 1;
    const timer = setTimeout(
      () => {
        if (next < pendingRound.outcome.cascades.length) {
          setCascadeIndex(next);
          setCascadeAnimating(true);
        } else {
          setCascadeActive(false);
          handleSettled();
        }
      },
      turbo ? 350 : 750
    );
    bonusTimers.current.push(timer);
  }

  function startBonusSpins() {
    if (bonusIntroTimer.current) clearTimeout(bonusIntroTimer.current);
    setBonusIntroVisible(false);
    setBonusActive(true);
    setBonusSpinning(true);
    setBonusNextIndex(null);
  }

  function handleBonusSpinSettled() {
    setBonusSpinning(false);
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
    const pauseMs = turbo ? 500 : 900;

    if (nextIndex < bonusSpins.length) {
      if (!bonusAuto) {
        setBonusNextIndex(nextIndex);
        return;
      }
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
    completeRound(pendingRoundRef.current);
    pendingRoundRef.current = null;
  }

  function revealBonusTotal() {
    bonusTimers.current.forEach(clearTimeout);
    bonusTimers.current = [];
    setBonusIntroVisible(false);
    setBonusActive(false);
    setBonusSpinning(false);
    setBonusNextIndex(null);
    setBonusOutroVisible(false);
    finishBonusOutro();
  }

  const multiplier = round?.outcome.multiplier || 0;
  const isBigWin = round && multiplier >= BIG_WIN_MULTIPLIER && !dismissedBigWin;
  const isAutoplaying = autoplayTotal !== null;
  const canAffordNormal = balanceCents >= normalCostCents;
  const canAffordBonus = balanceCents >= buyBonusCostCents;

  const cascadeFrame = cascadeActive ? pendingRound?.outcome.cascades[cascadeIndex] : null;
  const cascadePaidMultiplier =
    cascadeAnimating && cascadeIndex > 0
      ? pendingRound.outcome.cascades[cascadeIndex - 1].runningMultiplier
      : cascadeFrame?.runningMultiplier || 0;
  const displayResult = bonusActive
    ? bonusSpins[bonusIndex]
    : cascadeFrame ||
      round?.outcome.bonus?.spins?.at(-1) ||
      round?.outcome.cascades?.at(-1) ||
      round?.outcome ||
      pendingRound?.outcome;
  const displaySpinning = bonusActive
    ? bonusSpinning
    : cascadeActive
      ? cascadeAnimating
      : spinning && !bonusIntroVisible && !bonusOutroVisible;
  const displayOnSettled = bonusActive
    ? handleBonusSpinSettled
    : cascadeActive
      ? handleCascadeSettled
      : handleSettled;
  const paytable = slotsConfig?.paytable
    ? [...slotsConfig.paytable]
        .sort((a, b) => b.payout[5] - a.payout[5])
        .map((row) => ({
          symbol: row.symbol,
          values: `${row.payout[3]} · ${row.payout[4]} · ${row.payout[5]} ×`,
        }))
    : SLOT_PAYTABLE;

  return (
    <div className="slot-cabinet">
      <SlotArtwork id={artworkId} />
      {error && <div className="error-banner">{error}</div>}

      <div className="slot-marquee">
        <div className="slot-brand-emblem">
          <SlotSymbol symbol="👑" artworkId={artworkId} decorative />
        </div>
        <div>
          <div className="slot-edition">LA COLECCIÓN PALCO</div>
          <h2 className="slot-title">Corona Real</h2>
          <div className="slot-subtitle">Cinco carretes. Una experiencia real.</div>
        </div>
        <span className="slot-game-seal">
          5 × 3<span>10 líneas</span>
        </span>
      </div>

      <div className="slot-balance-strip">
        <div>
          <span>Tu saldo</span>
          <strong>{formatCents(balanceCents || 0)}</strong>
        </div>
        <div>
          <span>Apuesta total</span>
          <strong>{formatCents(normalCostCents)}</strong>
        </div>
        <div>
          <span>Último premio</span>
          <strong>{formatCents(lastPayoutCents)}</strong>
        </div>
      </div>

      {slotsConfig?.modes?.cascades && (
        <div className="slot-mode-picker" role="group" aria-label="Modalidad del tragamonedas">
          <button
            aria-pressed={slotMode === 'classic'}
            disabled={spinning || isAutoplaying}
            onClick={() => setSlotMode('classic')}
          >
            <strong>Clásico</strong>
            <span>Cinco carretes, diez líneas</span>
          </button>
          <button
            aria-pressed={slotMode === 'cascades'}
            disabled={spinning || isAutoplaying}
            onClick={() => setSlotMode('cascades')}
          >
            <strong>Cascadas Reales</strong>
            <span>Combinaciones y premios encadenados</span>
          </button>
        </div>
      )}
      {slotMode === 'cascades' && (
        <div className="slot-cascade-meter" aria-label="Multiplicadores de cascada">
          <div>
            <strong>Un giro. Hasta cuatro etapas.</strong>
            <span>
              Las combinaciones ganadoras dejan espacio a símbolos nuevos. Sin otra apuesta.
            </span>
          </div>
          <ol>
            {[1, 2, 3, 4].map((multiplier, index) => (
              <li
                key={multiplier}
                data-current={cascadeActive ? cascadeIndex === index : !round && index === 0}
              >
                ×{multiplier}
              </li>
            ))}
          </ol>
        </div>
      )}

      {bonusActive && bonusInfo && (
        <div className="slot-bonus-bar">
          <div>
            <span className="text-gold">Corona Ascendente · Giros gratis</span>
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

      {(bonusActive || bonusIntroVisible) && (
        <div className="slot-bonus-controls">
          {bonusNextIndex !== null && (
            <button
              className="btn"
              onClick={() => {
                setBonusIndex(bonusNextIndex);
                setBonusNextIndex(null);
                setBonusSpinning(true);
              }}
            >
              Siguiente giro gratis
            </button>
          )}
          <button className="btn-ghost" onClick={revealBonusTotal}>
            Ver premio total del bono
          </button>
        </div>
      )}

      {bonusRetriggerFlash && (
        <div className="slot-retrigger-flash">¡Re-disparo! Más giros gratis</div>
      )}

      <div className="slot-stage">
        <SlotMachine
          spinning={displaySpinning}
          result={displayResult}
          turbo={turbo}
          onSettled={displayOnSettled}
          artworkId={artworkId}
          cascadeFrame={cascadeActive && cascadeIndex > 0 ? cascadeFrame : null}
        />

        {isBigWin && (
          <div className="slot-bigwin-overlay">
            <div className="slot-bigwin-burst" />
            {Array.from({ length: 10 }).map((_, i) => (
              <span
                key={i}
                className="slot-bigwin-sparkle"
                style={{
                  left: `${8 + i * 9}%`,
                  animationDelay: `${(i % 5) * 0.15}s`,
                }}
              >
                {i % 2 === 0 ? '✦' : '✧'}
              </span>
            ))}
            <div className="slot-bigwin-label">
              {multiplier >= 80 ? '¡Premio mayor!' : '¡Gran premio!'}
            </div>
            <div className="slot-bigwin-amount">{formatCents(round.payout_cents)}</div>
            <button className="btn slot-bigwin-dismiss" onClick={() => setDismissedBigWin(true)}>
              {' '}
              Continuar
            </button>
          </div>
        )}

        {bonusIntroVisible && bonusInfo && (
          <div className="slot-bonus-intro-overlay">
            <div className="slot-bonus-intro-ring" />
            <div className="slot-bonus-intro-kicker">
              {bonusInfo.triggerScatterCount} símbolos de bono · Corona Ascendente
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
            <div className="slot-bonus-outro-amount mono">
              <AnimatedAmount cents={bonusOutroTotalCents} duration={turbo ? 500 : 1100} />
            </div>
            <button className="btn slot-bonus-outro-continue" onClick={finishBonusOutro}>
              Continuar
            </button>
          </div>
        )}
      </div>

      <div className="slot-round-status" role="status" aria-live="polite">
        <span
          className={`slot-status-dot ${displaySpinning ? 'is-spinning' : ''}`}
          aria-hidden="true"
        />
        <div>
          <strong>
            {bonusIntroVisible
              ? 'Corona Ascendente activada'
              : bonusOutroVisible
                ? 'Bono completado'
                : cascadeActive
                  ? `Cascada ${cascadeIndex + 1} de ${pendingRound.outcome.cascades.length} · ×${cascadeFrame.cascadeMultiplier}`
                  : bonusActive
                    ? `Giro gratis ${bonusIndex + 1} de ${bonusSpins.length}`
                    : spinning
                      ? 'Girando los carretes…'
                      : round
                        ? round.outcome.won
                          ? `Premio de ${formatCents(round.payout_cents)}`
                          : 'Giro completado'
                        : 'Todo listo para tu próximo giro'}
          </strong>
          <span>
            {cascadeActive
              ? `Premio acumulado: ${formatCents(Math.round(cascadePaidMultiplier * stakeCents))}`
              : bonusActive
                ? `Acumulado: ${formatCents(bonusRunningCents)}`
                : spinning
                  ? 'Cada carrete se detiene de izquierda a derecha.'
                  : round
                    ? 'Puedes revisar las combinaciones en la tabla de pagos.'
                    : 'Tres símbolos iguales desde la izquierda forman una combinación.'}
          </span>
        </div>
      </div>

      <div className="slot-controls">
        <div className="slot-wager-control">
          <span className="slot-wager-label">Apuesta base</span>
          <div className="slot-bet-stepper">
            <button
              type="button"
              onClick={() => setStakeCents((c) => Math.max(MIN_STAKE_CENTS, c - BET_STEP_CENTS))}
              disabled={spinning || stakeCents <= MIN_STAKE_CENTS}
              aria-label="Reducir apuesta"
            >
              −
            </button>
            <span className="slot-bet-value mono">{formatCents(stakeCents)}</span>
            <button
              type="button"
              onClick={() => setStakeCents((c) => c + BET_STEP_CENTS)}
              disabled={spinning}
              aria-label="Aumentar apuesta"
            >
              +
            </button>
          </div>
        </div>

        <button
          type="button"
          className={`slot-turbo-toggle ${turbo ? 'active' : ''}`}
          onClick={() => setTurbo((v) => !v)}
          disabled={spinning}
          aria-pressed={turbo}
          title="Cambiar entre ritmo normal y rápido"
        >
          <Icon name="play" size={16} /> {turbo ? 'Ritmo rápido' : 'Ritmo normal'}
        </button>

        {isAutoplaying ? (
          <button className="btn-ghost slot-spin-btn slot-autoplay-active" onClick={stopAutoplay}>
            <span className="slot-autoplay-dot" />
            Detener ({autoplayRemaining})
          </button>
        ) : (
          <button
            className="btn slot-spin-btn"
            onClick={() => spin()}
            disabled={spinning || !canAffordNormal}
          >
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
            style={{
              width: `${((autoplayTotal - autoplayRemaining) / autoplayTotal) * 100}%`,
            }}
          />
        </div>
      )}

      <details className="slot-options">
        <summary>
          Opciones de juego<span>Ante · Automático · Bono</span>
        </summary>
        <label className="slot-bonus-preference">
          <input
            type="checkbox"
            checked={bonusAuto}
            disabled={spinning || isAutoplaying}
            onChange={(event) => setBonusAuto(event.target.checked)}
          />{' '}
          Reproducir giros gratis automáticamente
        </label>
        <div className="slot-ante-row">
          <span className="text-sage slot-ante-label">Ante · Mayor probabilidad de bono</span>
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
            <span>Comprar bono · Corona Ascendente</span>
            <span className="mono">{formatCents(buyBonusCostCents)}</span>
          </button>
        </div>

        {!isAutoplaying && (
          <div className="slot-autoplay-row">
            <span className="text-sage" style={{ fontSize: 12 }}>
              Giros automáticos:
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
      </details>

      <div className="slot-readout-row">
        <span>Apostado por línea</span>
        <span className="slot-readout-value">{formatCents(Math.round(stakeCents / 10))} × 10</span>
      </div>

      <button
        className="slot-paytable-toggle"
        aria-expanded={showPaytable}
        onClick={() => setShowPaytable((v) => !v)}
      >
        {showPaytable ? 'Ocultar tabla de pagos' : 'Ver tabla de pagos'}
      </button>

      {showPaytable && (
        <div className="slot-paytable">
          <p className="slot-paytable-guide">
            3 · 4 · 5 símbolos consecutivos. Multiplicadores de la apuesta por línea.
          </p>
          {paytable.map((row) => (
            <div className="slot-paytable-row" key={row.symbol}>
              <span className="slot-paytable-symbol">
                {row.symbol.split(' ').map((symbol) => (
                  <SlotSymbol key={symbol} symbol={symbol} artworkId={artworkId} />
                ))}
              </span>
              <span className="slot-paytable-values">{row.values}</span>
            </div>
          ))}
          <p className="slot-paytable-guide">
            WILD sustituye símbolos de una línea. BONO activa giros gratis: 3 símbolos = 8 giros
            ×1.7; 4 = 12 ×2.6; 5 o más = 15 ×4.3. En Cascadas Reales se aplica además el
            multiplicador de cada etapa a sus líneas ganadoras.
          </p>
        </div>
      )}
      {recentRounds.length > 0 && (
        <div className="slot-history">
          <h3>Últimos giros de esta sesión</h3>
          {recentRounds.map((entry, index) => {
            const final =
              entry.outcome.bonus?.spins?.at(-1) || entry.outcome.cascades?.at(-1) || entry.outcome;
            return (
              <details key={entry.id}>
                <summary>
                  <span>
                    {entry.outcome.mode === 'cascades' ? 'Cascadas Reales' : 'Clásico'}
                    {entry.outcome.bonus ? ' · Bono' : ''}
                  </span>
                  <strong>{formatCents(entry.payout_cents)}</strong>
                  <small>Ver jugada {recentRounds.length - index}</small>
                </summary>
                <div className="slot-history-grid" aria-label="Símbolos de la jugada">
                  {final.grid.map((column, reel) => (
                    <div key={reel}>
                      {column.map((symbol, row) => (
                        <SlotSymbol key={row} symbol={symbol} artworkId={artworkId} />
                      ))}
                    </div>
                  ))}
                </div>
                <p>
                  Apuesta {formatCents(entry.stake_cents)} · Premio{' '}
                  {formatCents(entry.payout_cents)}
                  {entry.outcome.cascades ? ` · ${entry.outcome.cascades.length} etapas` : ''}.
                  Consultar esta jugada no realiza ninguna apuesta.
                </p>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
