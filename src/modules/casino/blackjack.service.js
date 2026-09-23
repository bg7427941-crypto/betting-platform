const { withTransaction, query } = require('../../db');
const { createShoe, drawCard, handValue, isBlackjack, playDealer, settleBlackjackHand } = require('./games.engine');
const { MAX_STAKE_CENTS } = require('./casino.service');

/** Vista pública del round: oculta la segunda carta del dealer mientras el jugador decide. */
function toPublicRound(round) {
  const o = round.outcome;
  const dealerCards = o.status === 'player_turn' ? [o.dealerCards[0], { hidden: true }] : o.dealerCards;
  return {
    id: round.id,
    status: o.status,
    stakeCents: o.stakeCents,
    doubled: o.doubled,
    playerCards: o.playerCards,
    playerValue: handValue(o.playerCards),
    dealerCards,
    dealerValue: o.status === 'player_turn' ? null : handValue(o.dealerCards),
    canDouble: o.status === 'player_turn' && o.playerCards.length === 2 && !o.doubled,
    resultOutcome: o.resultOutcome || null,
    payoutCents: round.payout_cents,
    createdAt: round.created_at,
  };
}

async function getActiveRound(client, userId) {
  const result = await client.query(
    `SELECT id, user_id, game, stake_cents, outcome, payout_cents, created_at
     FROM casino_rounds
     WHERE user_id = $1 AND game = 'blackjack' AND outcome->>'status' = 'player_turn'
     ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
    [userId]
  );
  return result.rows[0] || null;
}

async function getWallet(client, userId) {
  const result = await client.query(`SELECT id, balance_cents FROM wallets WHERE user_id = $1 FOR UPDATE`, [userId]);
  const wallet = result.rows[0];
  if (!wallet) throw Object.assign(new Error('Billetera no encontrada'), { status: 404 });
  return wallet;
}

async function debitWallet(client, wallet, amountCents, roundId) {
  const newBalance = Number(wallet.balance_cents) - amountCents;
  await client.query(`UPDATE wallets SET balance_cents = $1, updated_at = now() WHERE id = $2`, [
    newBalance,
    wallet.id,
  ]);
  await client.query(
    `INSERT INTO transactions (wallet_id, type, amount_cents, balance_after, reference_type, reference_id)
     VALUES ($1, 'bet_stake', $2, $3, 'casino_round', $4)`,
    [wallet.id, -amountCents, newBalance, roundId]
  );
  wallet.balance_cents = newBalance;
  return newBalance;
}

async function creditWallet(client, wallet, amountCents, roundId) {
  if (amountCents <= 0) return Number(wallet.balance_cents);
  const newBalance = Number(wallet.balance_cents) + amountCents;
  await client.query(`UPDATE wallets SET balance_cents = $1, updated_at = now() WHERE id = $2`, [
    newBalance,
    wallet.id,
  ]);
  await client.query(
    `INSERT INTO transactions (wallet_id, type, amount_cents, balance_after, reference_type, reference_id)
     VALUES ($1, 'bet_payout', $2, $3, 'casino_round', $4)`,
    [wallet.id, amountCents, newBalance, roundId]
  );
  wallet.balance_cents = newBalance;
  return newBalance;
}

/**
 * Cierra la mano: hace jugar al dealer si corresponde, liquida el pago y
 * persiste el resultado final. `deck` es el mazo YA actualizado (con las
 * cartas que el jugador acaba de sacar ya removidas) — nunca se lee de
 * `round.outcome.deck`, que puede estar desactualizado, para no arriesgar
 * que el dealer saque una carta que el jugador ya tiene en la mano.
 */
async function finishRound(client, wallet, round, playerCards, deck, { doubled } = {}) {
  const o = round.outcome;
  const effectiveDoubled = doubled ?? o.doubled;
  const bust = handValue(playerCards).value > 21;
  const playerBJ = !bust && isBlackjack(playerCards);

  // Si el jugador se pasó o tiene blackjack natural, el dealer no juega más
  // (regla estándar: con blackjack natural del jugador solo se revela la
  // carta tapada, no se pide más).
  const dealerCards = bust || playerBJ ? o.dealerCards : playDealer([...deck], o.dealerCards);

  const { outcome: resultOutcome, multiplier } = settleBlackjackHand(playerCards, dealerCards);

  const effectiveStakeCents = effectiveDoubled ? o.stakeCents * 2 : o.stakeCents;
  const payoutCents = Math.round(effectiveStakeCents * multiplier);

  const newOutcome = {
    status: 'finished',
    stakeCents: o.stakeCents,
    doubled: effectiveDoubled,
    playerCards,
    dealerCards,
    resultOutcome,
  };

  const balance = await creditWallet(client, wallet, payoutCents, round.id);

  // stake_cents (columna, para el historial) queda en el total EFECTIVO
  // apostado, ya con el double down incluido si lo hubo.
  const updateResult = await client.query(
    `UPDATE casino_rounds SET outcome = $1, payout_cents = $2, stake_cents = $3 WHERE id = $4
     RETURNING id, game, stake_cents, outcome, payout_cents, created_at`,
    [JSON.stringify(newOutcome), payoutCents, effectiveStakeCents, round.id]
  );

  return { round: updateResult.rows[0], balance_cents: balance };
}

async function startBlackjack(userId, { stakeCents }) {
  if (!Number.isInteger(stakeCents) || stakeCents <= 0) {
    throw Object.assign(new Error('Monto de apuesta inválido'), { status: 400 });
  }
  if (stakeCents > MAX_STAKE_CENTS) {
    throw Object.assign(new Error('Monto de apuesta excede el máximo permitido'), { status: 400 });
  }

  return withTransaction(async (client) => {
    const existing = await getActiveRound(client, userId);
    if (existing) {
      throw Object.assign(new Error('Ya tenés una mano de blackjack en curso'), { status: 409 });
    }

    const wallet = await getWallet(client, userId);
    if (Number(wallet.balance_cents) < stakeCents) {
      throw Object.assign(new Error('Saldo insuficiente'), { status: 400 });
    }

    const deck = createShoe();
    const playerCards = [drawCard(deck), drawCard(deck)];
    const dealerCards = [drawCard(deck), drawCard(deck)];

    const initialOutcome = {
      status: 'player_turn',
      stakeCents,
      doubled: false,
      deck,
      playerCards,
      dealerCards,
    };

    const insertResult = await client.query(
      `INSERT INTO casino_rounds (user_id, game, stake_cents, outcome, payout_cents)
       VALUES ($1, 'blackjack', $2, $3, 0)
       RETURNING id, game, stake_cents, outcome, payout_cents, created_at`,
      [userId, stakeCents, JSON.stringify(initialOutcome)]
    );
    const round = insertResult.rows[0];

    await debitWallet(client, wallet, stakeCents, round.id);

    // Blackjack natural (de cualquiera de los dos): se resuelve al toque.
    if (isBlackjack(playerCards) || isBlackjack(dealerCards)) {
      const result = await finishRound(client, wallet, round, playerCards, deck);
      return { round: toPublicRound(result.round), balance_cents: result.balance_cents };
    }

    return { round: toPublicRound(round), balance_cents: Number(wallet.balance_cents) };
  });
}

async function withActiveRound(userId, roundId, handler) {
  return withTransaction(async (client) => {
    const result = await client.query(
      `SELECT id, user_id, game, stake_cents, outcome, payout_cents, created_at
       FROM casino_rounds WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [roundId, userId]
    );
    const round = result.rows[0];
    if (!round) throw Object.assign(new Error('Mano no encontrada'), { status: 404 });
    if (round.outcome.status !== 'player_turn') {
      throw Object.assign(new Error('Esta mano ya terminó'), { status: 409 });
    }
    const wallet = await getWallet(client, userId);
    return handler(client, wallet, round);
  });
}

async function hitBlackjack(userId, roundId) {
  const { round, balance_cents } = await withActiveRound(userId, roundId, async (client, wallet, round) => {
    const o = round.outcome;
    const deck = [...o.deck];
    const playerCards = [...o.playerCards, drawCard(deck)];
    const value = handValue(playerCards).value;

    if (value >= 21) {
      // Se pasó, o llegó justo a 21 (ya no tiene sentido seguir pidiendo): cierra la mano.
      return finishRound(client, wallet, round, playerCards, deck);
    }

    const newOutcome = { ...o, playerCards, deck };
    const updateResult = await client.query(
      `UPDATE casino_rounds SET outcome = $1 WHERE id = $2
       RETURNING id, game, stake_cents, outcome, payout_cents, created_at`,
      [JSON.stringify(newOutcome), round.id]
    );
    return { round: updateResult.rows[0], balance_cents: Number(wallet.balance_cents) };
  });
  return { round: toPublicRound(round), balance_cents };
}

async function standBlackjack(userId, roundId) {
  const { round, balance_cents } = await withActiveRound(userId, roundId, (client, wallet, round) =>
    finishRound(client, wallet, round, round.outcome.playerCards, round.outcome.deck)
  );
  return { round: toPublicRound(round), balance_cents };
}

async function doubleBlackjack(userId, roundId) {
  const { round, balance_cents } = await withActiveRound(userId, roundId, async (client, wallet, round) => {
    const o = round.outcome;
    if (o.playerCards.length !== 2 || o.doubled) {
      throw Object.assign(new Error('Solo podés doblar con tu mano inicial de 2 cartas'), { status: 400 });
    }
    if (Number(wallet.balance_cents) < o.stakeCents) {
      throw Object.assign(new Error('Saldo insuficiente para doblar'), { status: 400 });
    }

    await debitWallet(client, wallet, o.stakeCents, round.id);

    const deck = [...o.deck];
    const playerCards = [...o.playerCards, drawCard(deck)];
    // Doblar = exactamente una carta más, y después el dealer juega sí o sí.
    return finishRound(client, wallet, round, playerCards, deck, { doubled: true });
  });
  return { round: toPublicRound(round), balance_cents };
}

async function getBlackjackState(userId) {
  const result = await query(
    `SELECT id, game, stake_cents, outcome, payout_cents, created_at
     FROM casino_rounds
     WHERE user_id = $1 AND game = 'blackjack' AND outcome->>'status' = 'player_turn'
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  const round = result.rows[0];
  return round ? toPublicRound(round) : null;
}

module.exports = { startBlackjack, hitBlackjack, standBlackjack, doubleBlackjack, getBlackjackState };
