import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useWallet, formatCents } from '../context/WalletContext';

const CHIPS = [1, 5, 10, 25, 100];

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

function Hand({ title, icon, cards, value, hideValue, live, flipIndex }) {
  return (
    <div className="bj-hand">
      <div className="bj-hand-title">
        <span className="bj-hand-icon">{icon}</span>
        {title}
        {live && <span className="bj-turn-dot" title="Tu turno" />}
        {!hideValue && value && (
          <span className="mono text-gold bj-hand-value">
            {value.value}
            {value.soft && value.value <= 21 ? ' (suave)' : ''}
            {value.value > 21 ? ' — se pasó' : ''}
          </span>
        )}
      </div>
      <div className="bj-cards">
        {cards.map((c, i) => (
          <Card key={i} card={c} delay={i * 0.14} flip={i === flipIndex} />
        ))}
      </div>
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
    if (round && prevStatusRef.current === 'player_turn' && round.status === 'finished') {
      setDealerRevealNonce((n) => n + 1);
    }
    prevStatusRef.current = round ? round.status : null;
  }, [round]);

  const inHand = round && round.status === 'player_turn';
  const finished = round && round.status === 'finished';

  function addChip(value) {
    setSelectedChip(value);
    setStakeCents((prev) => prev + value * 100);
  }

  async function start() {
    if (stakeCents <= 0) return;
    setError('');
    setLoading(true);
    try {
      const { round: newRound } = await api.startBlackjack(stakeCents);
      setRound(newRound);
      refresh();
      if (newRound.status === 'finished') {
        onRoundSettled?.(newRound.payoutCents - newRound.stakeCents);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function act(action) {
    if (!round) return;
    setError('');
    setLoading(true);
    setLoadingAction(action);
    try {
      const fn = action === 'hit' ? api.hitBlackjack : action === 'stand' ? api.standBlackjack : api.doubleBlackjack;
      const { round: updated } = await fn(round.id);
      setRound(updated);
      refresh();
      if (updated.status === 'finished') {
        onRoundSettled?.(updated.payoutCents - updated.stakeCents);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setLoadingAction(null);
    }
  }

  function playAgain() {
    setRound(null);
    setError('');
  }

  const dealerFlipIndex = finished && dealerRevealNonce > 0 ? 1 : -1;

  return (
    <div className="bj-table">
      <div className="bj-felt">
        <div className="bj-felt-legend">BLACKJACK PAGA 3 A 2 · EL DEALER PLANTA EN 17 · 6 MAZOS</div>

        {!round && (
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
              {loading ? 'Repartiendo…' : 'Repartir'}
            </button>
          </div>
        )}

        {round && (
          <div className="bj-board">
            <Hand
              title="Dealer"
              icon="🎩"
              cards={round.dealerCards}
              value={round.dealerValue}
              hideValue={round.status === 'player_turn'}
              flipIndex={dealerFlipIndex}
            />

            <div className="bj-divider">
              {round.deckRemaining != null && (
                <span className="bj-shoe mono">🂠 {round.deckRemaining} cartas en el zapato</span>
              )}
            </div>

            <Hand title="Tú" icon="👤" cards={round.playerCards} value={round.playerValue} live={inHand} />

            {inHand && (
              <div className="bj-actions">
                <button className="btn" disabled={loading} onClick={() => act('hit')}>
                  {loadingAction === 'hit' ? 'Pidiendo…' : 'Pedir'}
                </button>
                <button className="btn" disabled={loading} onClick={() => act('stand')}>
                  {loadingAction === 'stand' ? 'Plantando…' : 'Plantarme'}
                </button>
                {round.canDouble && (
                  <button
                    className="btn-ghost"
                    disabled={loading || (balanceCents ?? 0) < round.stakeCents}
                    onClick={() => act('double')}
                  >
                    {loadingAction === 'double' ? 'Doblando…' : 'Doblar'}
                  </button>
                )}
              </div>
            )}

            {finished && (
              <div className="bj-result">
                <p className={`bj-result-banner ${round.payoutCents > 0 ? 'text-gold' : 'text-brick'}`}>
                  {OUTCOME_LABEL[round.resultOutcome] || round.resultOutcome}
                  {round.payoutCents > 0 ? ` — cobrás ${formatCents(round.payoutCents)}` : ''}
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
