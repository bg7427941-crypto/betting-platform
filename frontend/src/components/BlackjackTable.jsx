import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useWallet, formatCents } from '../context/WalletContext';
import * as sound from '../lib/sound';

const CHIPS = [1, 5, 10, 25, 100];
const STREAK_KEY = 'bj-streak';
const SHUFFLE_MS = 620;

const SUIT_COLOR = { '♥': 'text-brick', '♦': 'text-brick' };

const OUTCOME_LABEL = {
  player_blackjack: '¡Blackjack! Pagás 3:2',
  win: 'Ganaste la mano',
  push: 'Empate — se devuelve tu apuesta',
  loss: 'Perdiste la mano',
  bust: 'Te pasaste de 21',
};

function Card({ card, delay = 0, flip = false }) {
  if (card.hidden) {
    return <div className="bj-card bj-card-back" style={{ animationDelay: `${delay}s` }} />;
  }
  return (
    <div
      className={`bj-card ${SUIT_COLOR[card.suit] || ''} ${flip ? 'bj-card-flip' : 'bj-card-deal'}`}
      style={{ animationDelay: `${delay}s` }}
    >
      <span className="bj-card-rank">{card.rank}</span>
      <span className="bj-card-suit">{card.suit}</span>
      <span className="bj-card-rank bj-card-rank-mirror">{card.rank}</span>
    </div>
  );
}

function CardRow({ cards, flipIndex }) {
  return (
    <div className="bj-cards">
      {cards.map((c, i) => (
        <Card key={i} card={c} delay={i * 0.14} flip={i === flipIndex} />
      ))}
    </div>
  );
}

function DealerHand({ cards, value, hidden, flipIndex }) {
  return (
    <div className="bj-hand">
      <div className="bj-hand-title">
        <span className="bj-hand-icon">🎩</span>
        Dealer
        {!hidden && value && (
          <span className="mono text-gold bj-hand-value">
            {value.value}
            {value.soft && value.value <= 21 ? ' (suave)' : ''}
            {value.value > 21 ? ' — se pasó' : ''}
          </span>
        )}
      </div>
      <CardRow cards={cards} flipIndex={flipIndex} />
    </div>
  );
}

function PlayerHand({ hand, index, total, finished }) {
  return (
    <div className={`bj-hand ${hand.active ? 'bj-hand-active' : ''}`}>
      <div className="bj-hand-title">
        <span className="bj-hand-icon">👤</span>
        {total > 1 ? `Mano ${index + 1}` : 'Vos'}
        {hand.doubled && <span className="bj-tag">doblada</span>}
        {hand.active && <span className="bj-turn-dot" title="Tu turno" />}
        <span className="mono text-gold bj-hand-value">
          {hand.value.value}
          {hand.value.soft && hand.value.value <= 21 ? ' (suave)' : ''}
          {hand.value.value > 21 ? ' — se pasó' : ''}
        </span>
      </div>
      <CardRow cards={hand.cards} />
      {finished && hand.resultOutcome && (
        <p className={`bj-hand-result mono ${hand.payoutCents > 0 ? 'text-gold' : 'text-brick'}`}>
          {OUTCOME_LABEL[hand.resultOutcome] || hand.resultOutcome}
          {hand.payoutCents > 0 ? ` · +${formatCents(hand.payoutCents)}` : ''}
        </p>
      )}
    </div>
  );
}

function ShuffleAnimation() {
  return (
    <div className="bj-shuffle">
      <div className="bj-shuffle-cards">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bj-card bj-card-back bj-shuffle-card" style={{ animationDelay: `${i * 0.06}s` }} />
        ))}
      </div>
      <p className="bj-shuffle-label mono">Barajando el zapato…</p>
    </div>
  );
}

export default function BlackjackTable({ onRoundSettled }) {
  const { balanceCents, refresh } = useWallet();
  const [stakeCents, setStakeCents] = useState(500);
  const [selectedChip, setSelectedChip] = useState(5);
  const [round, setRound] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingAction, setLoadingAction] = useState(null);
  const [error, setError] = useState('');
  const [shuffling, setShuffling] = useState(false);
  const [muted, setMutedState] = useState(sound.isMuted());
  const [streak, setStreak] = useState(() => Number(localStorage.getItem(STREAK_KEY) || 0));

  // Para animar el flip de la carta tapada del dealer sólo cuando la mano
  // se resuelve en vivo (no cuando se recupera ya terminada al montar).
  const prevStatusRef = useRef(null);
  const [dealerRevealNonce, setDealerRevealNonce] = useState(0);

  useEffect(() => {
    api
      .getBlackjackState()
      .then(({ round: active }) => {
        if (active) setRound(active);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (round && prevStatusRef.current !== 'finished' && round.status === 'finished') {
      setDealerRevealNonce((n) => n + 1);
    }
    prevStatusRef.current = round ? round.status : null;
  }, [round]);

  const inInsuranceDecision = round && round.status === 'insurance_decision';
  const inHand = round && round.status === 'player_turn';
  const finished = round && round.status === 'finished';

  function addChip(value) {
    sound.playChip();
    setSelectedChip(value);
    setStakeCents((prev) => prev + value * 100);
  }

  function toggleMute() {
    const next = !muted;
    sound.setMuted(next);
    setMutedState(next);
  }

  function settleOutcomeSound(updated) {
    // Con varias manos (split), el resultado "principal" es la peor/mejor:
    // usamos el que tenga mayor pago para decidir el sonido y la racha.
    const best = [...updated.hands].sort((a, b) => (b.payoutCents || 0) - (a.payoutCents || 0))[0];
    const outcome = best?.resultOutcome;
    const won = outcome === 'win' || outcome === 'player_blackjack';
    const next = won ? streak + 1 : 0;
    setStreak(next);
    localStorage.setItem(STREAK_KEY, String(next));
    if (outcome === 'player_blackjack') sound.playBlackjack();
    else if (outcome === 'win') sound.playWin();
    else if (outcome === 'push') sound.playPush();
    else sound.playLose();
  }

  async function runAction(fn, actionName) {
    setError('');
    setLoading(true);
    setLoadingAction(actionName);
    try {
      const { round: updated } = await fn();
      setRound(updated);
      refresh();
      if (actionName !== 'start') sound.playCard();
      if (updated.status === 'finished') {
        onRoundSettled?.(updated.payoutCents - updated.stakeCents);
        setTimeout(() => settleOutcomeSound(updated), 450);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setLoadingAction(null);
    }
  }

  async function start() {
    if (stakeCents <= 0) return;
    setError('');
    setLoading(true);
    setLoadingAction('start');
    setShuffling(true);
    const shuffleWait = new Promise((resolve) => setTimeout(resolve, SHUFFLE_MS));
    try {
      const [{ round: newRound }] = await Promise.all([api.startBlackjack(stakeCents), shuffleWait]);
      setRound(newRound);
      refresh();
      sound.playDealSequence(newRound.dealerCards.length + newRound.hands[0].cards.length);
      if (newRound.status === 'finished') {
        onRoundSettled?.(newRound.payoutCents - newRound.stakeCents);
        setTimeout(() => settleOutcomeSound(newRound), 550);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setLoadingAction(null);
      setShuffling(false);
    }
  }

  function playAgain() {
    setRound(null);
    setError('');
  }

  const dealerFlipIndex = finished && dealerRevealNonce > 0 ? 1 : -1;
  const activeHand = round?.hands.find((h) => h.active);

  return (
    <div className="bj-table">
      <div className="bj-felt">
        <div className="bj-felt-legend">
          BLACKJACK PAGA 3 A 2 · EL DEALER PLANTA EN 17 · 6 MAZOS
          <button
            className="bj-mute"
            onClick={toggleMute}
            aria-label={muted ? 'Activar sonido' : 'Silenciar'}
            title={muted ? 'Activar sonido' : 'Silenciar'}
          >
            {muted ? '🔇' : '🔊'}
          </button>
        </div>

        {streak >= 2 && (
          <div className="bj-streak mono text-gold">
            🔥 Racha: {streak} {streak === 1 ? 'mano' : 'manos'} seguidas
          </div>
        )}

        {shuffling && <ShuffleAnimation />}

        {!round && !shuffling && (
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
              Apuesta: <span className="mono text-gold bj-stake-amount">{formatCents(stakeCents)}</span>
            </p>
            <button className="btn" disabled={stakeCents <= 0 || loading} onClick={start}>
              Repartir
            </button>
          </div>
        )}

        {round && !shuffling && (
          <div className="bj-board">
            <DealerHand
              cards={round.dealerCards}
              value={round.dealerValue}
              hidden={round.status !== 'finished'}
              flipIndex={dealerFlipIndex}
            />

            <div className="bj-divider" />

            <div className="bj-hands">
              {round.hands.map((hand, i) => (
                <PlayerHand key={i} hand={hand} index={i} total={round.hands.length} finished={finished} />
              ))}
            </div>

            {inInsuranceDecision && (
              <div className="bj-insurance">
                <p>
                  El dealer muestra as. ¿Tomás <strong>seguro</strong> por{' '}
                  <span className="mono text-gold">{formatCents(round.insuranceMaxCents)}</span>? Paga 2:1 si el
                  dealer tiene blackjack.
                </p>
                <div className="bj-actions">
                  <button
                    className="btn"
                    disabled={loading || (balanceCents ?? 0) < round.insuranceMaxCents}
                    onClick={() => runAction(() => api.insuranceBlackjack(round.id, true), 'insurance')}
                  >
                    Asegurar
                  </button>
                  <button
                    className="btn-ghost"
                    disabled={loading}
                    onClick={() => runAction(() => api.insuranceBlackjack(round.id, false), 'insurance')}
                  >
                    No, gracias
                  </button>
                </div>
              </div>
            )}

            {inHand && activeHand && (
              <div className="bj-actions">
                <button className="btn" disabled={loading} onClick={() => runAction(() => api.hitBlackjack(round.id), 'hit')}>
                  {loadingAction === 'hit' ? 'Pidiendo…' : 'Pedir'}
                </button>
                <button
                  className="btn"
                  disabled={loading}
                  onClick={() => runAction(() => api.standBlackjack(round.id), 'stand')}
                >
                  {loadingAction === 'stand' ? 'Plantando…' : 'Plantarme'}
                </button>
                {round.canDouble && (
                  <button
                    className="btn-ghost"
                    disabled={loading || (balanceCents ?? 0) < round.stakeCents}
                    onClick={() => runAction(() => api.doubleBlackjack(round.id), 'double')}
                  >
                    {loadingAction === 'double' ? 'Doblando…' : 'Doblar'}
                  </button>
                )}
                {round.canSplit && (
                  <button
                    className="btn-ghost"
                    disabled={loading || (balanceCents ?? 0) < round.stakeCents}
                    onClick={() => runAction(() => api.splitBlackjack(round.id), 'split')}
                  >
                    {loadingAction === 'split' ? 'Dividiendo…' : 'Dividir'}
                  </button>
                )}
              </div>
            )}

            {finished && (
              <div className="bj-result">
                <p className={`bj-result-banner ${round.payoutCents > 0 ? 'text-gold' : 'text-brick'}`}>
                  {round.hands.length > 1
                    ? `Total: ${round.payoutCents > 0 ? `cobrás ${formatCents(round.payoutCents)}` : 'sin cobro'}`
                    : `${OUTCOME_LABEL[round.hands[0].resultOutcome] || round.hands[0].resultOutcome}${
                        round.payoutCents > 0 ? ` — cobrás ${formatCents(round.payoutCents)}` : ''
                      }`}
                </p>
                <button className="btn" onClick={playAgain}>
                  Jugar de nuevo
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-brick">{error}</p>}
    </div>
  );
}
