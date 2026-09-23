import { useEffect, useState } from 'react';
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

function Card({ card }) {
  if (card.hidden) {
    return <div className="bj-card bj-card-back">🂠</div>;
  }
  return (
    <div className={`bj-card ${SUIT_COLOR[card.suit] || ''}`}>
      <span className="bj-card-rank">{card.rank}</span>
      <span className="bj-card-suit">{card.suit}</span>
    </div>
  );
}

function Hand({ title, cards, value, hideValue }) {
  return (
    <div className="bj-hand">
      <div className="bj-hand-title">
        {title}
        {!hideValue && value && (
          <span className="mono text-gold">
            {' '}
            — {value.value}
            {value.soft && value.value <= 21 ? ' (suave)' : ''}
          </span>
        )}
      </div>
      <div className="bj-cards">
        {cards.map((c, i) => (
          <Card key={i} card={c} />
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
  const [error, setError] = useState('');

  // Al entrar, si había una mano en curso (ej. refrescaste la página), la recupera.
  useEffect(() => {
    api
      .getBlackjackState()
      .then(({ round: active }) => {
        if (active) setRound(active);
      })
      .catch(() => {});
  }, []);

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
      const { round: newRound, balance_cents } = await api.startBlackjack(stakeCents);
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
    }
  }

  function playAgain() {
    setRound(null);
    setError('');
  }

  return (
    <div className="bj-table">
      {!round && (
        <>
          <p className="page-sub">Blackjack clásico — dealer planta en 17, blackjack paga 3:2.</p>
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
            Apuesta: <span className="mono text-gold">{formatCents(stakeCents)}</span>
          </p>
          <button className="btn" disabled={stakeCents <= 0 || loading} onClick={start}>
            Repartir
          </button>
        </>
      )}

      {round && (
        <div className="bj-board">
          <Hand
            title="Dealer"
            cards={round.dealerCards}
            value={round.dealerValue}
            hideValue={round.status === 'player_turn'}
          />
          <Hand title="Vos" cards={round.playerCards} value={round.playerValue} />

          {inHand && (
            <div className="bj-actions">
              <button className="btn" disabled={loading} onClick={() => act('hit')}>
                Pedir
              </button>
              <button className="btn" disabled={loading} onClick={() => act('stand')}>
                Plantarme
              </button>
              {round.canDouble && (
                <button
                  className="btn-ghost"
                  disabled={loading || (balanceCents ?? 0) < round.stakeCents}
                  onClick={() => act('double')}
                >
                  Doblar
                </button>
              )}
            </div>
          )}

          {finished && (
            <div className="bj-result">
              <p className={round.payoutCents > 0 ? 'text-gold' : 'text-brick'}>
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

      {error && <p className="text-brick">{error}</p>}
    </div>
  );
}
