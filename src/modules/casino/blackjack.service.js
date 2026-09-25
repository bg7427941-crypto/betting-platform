const { withTransaction, query } = require('../../db');
const {
  createShoe,
  drawCard,
  rankValue,
  handValue,
  isBlackjack,
  isSplittablePair,
  playDealer,
  settleBlackjackHand,
} = require('./games.engine');
const { MAX_STAKE_CENTS } = require('./casino.service');

const ACTIVE_STATUSES = "('insurance_decision', 'player_turn')";

/** Vista pública del round: oculta la carta tapada del dealer mientras se decide algo. */
function toPublicRound(round) {
  const o = round.outcome;
  const dealerHidden = o.status === 'insurance_decision' || o.status === 'player_turn';
  const dealerCards = dealerHidden ? [o.dealerCards[0], { hidden: true }] : o.dealerCards;
  const activeHand = o.status === 'player_turn' ? o.hands[o.activeHandIndex] : null;

  return {
    id: round.id,
    status: o.status,
    stakeCents: round.stake_cents,
    hands: o.hands.map((h, i) => ({
      cards: h.cards,
      value: handValue(h.cards),
      doubled: h.doubled,
      isSplitHand: h.isSplitHand,
      active: o.status === 'player_turn' && i === o.activeHandIndex,
      resultOutcome: h.resultOutcome || null,
      payoutCents: h.payoutCents != null ? h.payoutCents : null,
    })),
    activeHandIndex: o.activeHandIndex,
    dealerCards,
    dealerValue: dealerHidden ? null : handValue(o.dealerCards),
    insurance: o.insurance || null,
    insuranceMaxCents: o.status === 'insurance_decision' ? Math.floor(o.stakeCents / 2) : null,
    canDouble: !!activeHand && activeHand.cards.length === 2 && !activeHand.doubled,
    canSplit: !!activeHand && o.hands.length === 1 && isSplittablePair(activeHand.cards),
    payoutCents: round.payout_cents,
    createdAt: round.created_at,
  };
}

async function getActiveRound(client, userId) {
  const result = await client.query(
    `SELECT id, user_id, game, stake_cents, outcome, payout_cents, created_at
     FROM casino_rounds
     WHERE user_id = $1 AND game = 'blackjack' AND outcome->>'status' IN ${ACTIVE_STATUSES}
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

async function creditWallet(client, wallet, amountCents, roundId, type = 'bet_payout') {
  if (amountCents <= 0) return Number(wallet.balance_cents);
  const newBalance = Number(wallet.balance_cents) + amountCents;
  await client.query(`UPDATE wallets SET balance_cents = $1, updated_at = now() WHERE id = $2`, [
    newBalance,
    wallet.id,
  ]);
  await client.query(
    `INSERT INTO transactions (wallet_id, type, amount_cents, balance_after, reference_type, reference_id)
     VALUES ($1, $2, $3, $4, 'casino_round', $5)`,
    [wallet.id, type, amountCents, newBalance, roundId]
  );
  wallet.balance_cents = newBalance;
  return newBalance;
}

/**
 * ¿Hay algo más que jugar, o ya se puede liquidar tal cual está la mesa?
 * Cubre los tres motivos por los que el dealer NO pide más cartas:
 * ya tiene blackjack natural, todas las manos del jugador se pasaron, o el
 * jugador tiene blackjack natural en una mano única (sin split).
 */
function shouldDealerHoldWithoutPlaying(hands, dealerCards) {
  if (isBlackjack(dealerCards)) return true;
  if (hands.every((h) => handValue(h.cards).value > 21)) return true;
  if (hands.length === 1 && !hands[0].isSplitHand && isBlackjack(hands[0].cards)) return true;
  return false;
}

function findNextActiveIndex(hands, fromIndex) {
  for (let i = fromIndex; i < hands.length; i += 1) {
    if (!hands[i].done) return i;
  }
  return -1;
}

/**
 * Cierra la ronda: hace jugar al dealer si corresponde, liquida cada mano
 * por separado (una mano dividida puede ganar y la otra perder) y persiste
 * el resultado. `deck` es el mazo YA actualizado — nunca se lee el `deck`
 * de `round.outcome`, que puede estar desactualizado.
 * `alreadyCreditedCents`: plata del seguro que ya se acreditó aparte (solo
 * se suma acá para que el total mostrado en el historial sea correcto, no
 * se vuelve a acreditar).
 */
async function finishHands(client, wallet, round, hands, deck, alreadyCreditedCents = 0) {
  const o = round.outcome;
  const dealerCardsFinal = shouldDealerHoldWithoutPlaying(hands, o.dealerCards)
    ? o.dealerCards
    : playDealer([...deck], o.dealerCards);

  let totalPayout = 0;
  let totalStake = o.insurance && o.insurance.taken ? o.insurance.stakeCents : 0;

  const settledHands = hands.map((h) => {
    const effectiveStake = o.stakeCents * (h.doubled ? 2 : 1);
    const { outcome, multiplier } = settleBlackjackHand(h.cards, dealerCardsFinal, h.isSplitHand);
    const payoutCents = Math.round(effectiveStake * multiplier);
    totalPayout += payoutCents;
    totalStake += effectiveStake;
    return {
      cards: h.cards,
      doubled: h.doubled,
      isSplitHand: h.isSplitHand,
      resultOutcome: outcome,
      payoutCents,
    };
  });

  const newOutcome = {
    status: 'finished',
    stakeCents: o.stakeCents,
    insurance: o.insurance || null,
    dealerCards: dealerCardsFinal,
    hands: settledHands,
    activeHandIndex: 0,
  };

  const balance = await creditWallet(client, wallet, totalPayout, round.id);

  const updateResult = await client.query(
    `UPDATE casino_rounds SET outcome = $1, payout_cents = $2, stake_cents = $3 WHERE id = $4
     RETURNING id, game, stake_cents, outcome, payout_cents, created_at`,
    [JSON.stringify(newOutcome), totalPayout + alreadyCreditedCents, totalStake, round.id]
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
    const hands = [{ cards: playerCards, doubled: false, isSplitHand: false, done: false }];
    const dealerShowsAce = dealerCards[0].rank === 'A';

    const initialOutcome = {
      status: dealerShowsAce ? 'insurance_decision' : 'player_turn',
      stakeCents,
      deck,
      dealerCards,
      hands,
      activeHandIndex: 0,
      insurance: dealerShowsAce ? { available: true, taken: false, stakeCents: 0, resolved: false } : null,
    };

    const insertResult = await client.query(
      `INSERT INTO casino_rounds (user_id, game, stake_cents, outcome, payout_cents)
       VALUES ($1, 'blackjack', $2, $3, 0)
       RETURNING id, game, stake_cents, outcome, payout_cents, created_at`,
      [userId, stakeCents, JSON.stringify(initialOutcome)]
    );
    const round = insertResult.rows[0];

    await debitWallet(client, wallet, stakeCents, round.id);

    // Si el dealer muestra as, esperamos la decisión de seguro antes de
    // resolver nada (ni siquiera un blackjack natural del jugador).
    if (!dealerShowsAce && shouldDealerHoldWithoutPlaying(hands, dealerCards)) {
      hands[0].done = true;
      const result = await finishHands(client, wallet, round, hands, deck);
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
    const wallet = await getWallet(client, userId);
    return handler(client, wallet, round);
  });
}

async function insuranceBlackjack(userId, roundId, take) {
  const { round, balance_cents } = await withActiveRound(userId, roundId, async (client, wallet, round) => {
    const o = round.outcome;
    if (o.status !== 'insurance_decision') {
      throw Object.assign(new Error('No corresponde decidir el seguro en este momento'), { status: 409 });
    }

    const insuranceCents = Math.floor(o.stakeCents / 2);
    if (take) {
      if (Number(wallet.balance_cents) < insuranceCents) {
        throw Object.assign(new Error('Saldo insuficiente para el seguro'), { status: 400 });
      }
      await debitWallet(client, wallet, insuranceCents, round.id);
    }

    const dealerHasBlackjack = isBlackjack(o.dealerCards);
    const insurance = {
      available: true,
      taken: !!take,
      stakeCents: take ? insuranceCents : 0,
      resolved: true,
      won: dealerHasBlackjack && !!take,
    };

    let insuranceWinCents = 0;
    if (insurance.won) {
      insuranceWinCents = insuranceCents * 3; // paga 2:1 + devuelve la apuesta del seguro
      await creditWallet(client, wallet, insuranceWinCents, round.id, 'bet_payout');
    }

    const roundWithInsurance = { ...round, outcome: { ...o, insurance } };

    if (dealerHasBlackjack) {
      // El dealer ya tiene blackjack: se liquida la(s) mano(s) principal(es) al toque.
      const hands = o.hands.map((h) => ({ ...h, done: true }));
      return finishHands(client, wallet, roundWithInsurance, hands, o.deck, insuranceWinCents);
    }

    if (!o.hands[0].isSplitHand && isBlackjack(o.hands[0].cards)) {
      // Blackjack natural del jugador contra un dealer sin blackjack: paga 3:2 ya.
      const hands = o.hands.map((h) => ({ ...h, done: true }));
      return finishHands(client, wallet, roundWithInsurance, hands, o.deck, insuranceWinCents);
    }

    const newOutcome = { ...o, insurance, status: 'player_turn' };
    const updateResult = await client.query(
      `UPDATE casino_rounds SET outcome = $1 WHERE id = $2
       RETURNING id, game, stake_cents, outcome, payout_cents, created_at`,
      [JSON.stringify(newOutcome), round.id]
    );
    return { round: updateResult.rows[0], balance_cents: Number(wallet.balance_cents) };
  });
  return { round: toPublicRound(round), balance_cents };
}

async function hitBlackjack(userId, roundId) {
  const { round, balance_cents } = await withActiveRound(userId, roundId, async (client, wallet, round) => {
    const o = round.outcome;
    if (o.status !== 'player_turn') {
      throw Object.assign(new Error('Esta mano no está esperando una jugada'), { status: 409 });
    }
    const deck = [...o.deck];
    const hands = o.hands.map((h, i) => (i === o.activeHandIndex ? { ...h, cards: [...h.cards, drawCard(deck)] } : h));
    const active = hands[o.activeHandIndex];
    if (handValue(active.cards).value >= 21) active.done = true;

    const nextIndex = findNextActiveIndex(hands, active.done ? o.activeHandIndex + 1 : o.activeHandIndex);
    if (nextIndex === -1) {
      return finishHands(client, wallet, { ...round, outcome: { ...o, hands, deck } }, hands, deck);
    }

    const newOutcome = { ...o, hands, deck, activeHandIndex: nextIndex };
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
  const { round, balance_cents } = await withActiveRound(userId, roundId, async (client, wallet, round) => {
    const o = round.outcome;
    if (o.status !== 'player_turn') {
      throw Object.assign(new Error('Esta mano no está esperando una jugada'), { status: 409 });
    }
    const hands = o.hands.map((h, i) => (i === o.activeHandIndex ? { ...h, done: true } : h));
    const nextIndex = findNextActiveIndex(hands, o.activeHandIndex + 1);
    if (nextIndex === -1) {
      return finishHands(client, wallet, round, hands, o.deck);
    }
    const newOutcome = { ...o, hands, activeHandIndex: nextIndex };
    const updateResult = await client.query(
      `UPDATE casino_rounds SET outcome = $1 WHERE id = $2
       RETURNING id, game, stake_cents, outcome, payout_cents, created_at`,
      [JSON.stringify(newOutcome), round.id]
    );
    return { round: updateResult.rows[0], balance_cents: Number(wallet.balance_cents) };
  });
  return { round: toPublicRound(round), balance_cents };
}

async function doubleBlackjack(userId, roundId) {
  const { round, balance_cents } = await withActiveRound(userId, roundId, async (client, wallet, round) => {
    const o = round.outcome;
    if (o.status !== 'player_turn') {
      throw Object.assign(new Error('Esta mano no está esperando una jugada'), { status: 409 });
    }
    const active = o.hands[o.activeHandIndex];
    if (active.cards.length !== 2 || active.doubled) {
      throw Object.assign(new Error('Solo podés doblar con la mano recién repartida (2 cartas)'), { status: 400 });
    }
    if (Number(wallet.balance_cents) < o.stakeCents) {
      throw Object.assign(new Error('Saldo insuficiente para doblar'), { status: 400 });
    }

    await debitWallet(client, wallet, o.stakeCents, round.id);

    const deck = [...o.deck];
    const hands = o.hands.map((h, i) =>
      i === o.activeHandIndex ? { ...h, cards: [...h.cards, drawCard(deck)], doubled: true, done: true } : h
    );

    const nextIndex = findNextActiveIndex(hands, o.activeHandIndex + 1);
    if (nextIndex === -1) {
      return finishHands(client, wallet, { ...round, outcome: { ...o, hands, deck } }, hands, deck);
    }
    const newOutcome = { ...o, hands, deck, activeHandIndex: nextIndex };
    const updateResult = await client.query(
      `UPDATE casino_rounds SET outcome = $1 WHERE id = $2
       RETURNING id, game, stake_cents, outcome, payout_cents, created_at`,
      [JSON.stringify(newOutcome), round.id]
    );
    return { round: updateResult.rows[0], balance_cents: Number(wallet.balance_cents) };
  });
  return { round: toPublicRound(round), balance_cents };
}

async function splitBlackjack(userId, roundId) {
  const { round, balance_cents } = await withActiveRound(userId, roundId, async (client, wallet, round) => {
    const o = round.outcome;
    if (o.status !== 'player_turn') {
      throw Object.assign(new Error('Esta mano no está esperando una jugada'), { status: 409 });
    }
    if (o.hands.length !== 1) {
      throw Object.assign(new Error('Ya dividiste esta mano'), { status: 400 });
    }
    const hand = o.hands[0];
    if (!isSplittablePair(hand.cards)) {
      throw Object.assign(new Error('Estas dos cartas no se pueden dividir'), { status: 400 });
    }
    if (Number(wallet.balance_cents) < o.stakeCents) {
      throw Object.assign(new Error('Saldo insuficiente para dividir'), { status: 400 });
    }

    await debitWallet(client, wallet, o.stakeCents, round.id);

    const deck = [...o.deck];
    const isAceSplit = hand.cards[0].rank === 'A';
    // Al dividir ases, cada mano recibe UNA sola carta y se planta sola —
    // regla estándar, evita encadenar ases para inflar el valor esperado.
    const hand1 = { cards: [hand.cards[0], drawCard(deck)], doubled: false, isSplitHand: true, done: false };
    const hand2 = { cards: [hand.cards[1], drawCard(deck)], doubled: false, isSplitHand: true, done: false };
    hand1.done = isAceSplit || handValue(hand1.cards).value === 21;
    hand2.done = isAceSplit || handValue(hand2.cards).value === 21;

    const hands = [hand1, hand2];
    const nextIndex = findNextActiveIndex(hands, 0);

    if (nextIndex === -1) {
      return finishHands(client, wallet, { ...round, outcome: { ...o, hands, deck } }, hands, deck);
    }

    const newOutcome = { ...o, hands, deck, activeHandIndex: nextIndex };
    const updateResult = await client.query(
      `UPDATE casino_rounds SET outcome = $1 WHERE id = $2
       RETURNING id, game, stake_cents, outcome, payout_cents, created_at`,
      [JSON.stringify(newOutcome), round.id]
    );
    return { round: updateResult.rows[0], balance_cents: Number(wallet.balance_cents) };
  });
  return { round: toPublicRound(round), balance_cents };
}

async function getBlackjackState(userId) {
  const result = await query(
    `SELECT id, game, stake_cents, outcome, payout_cents, created_at
     FROM casino_rounds
     WHERE user_id = $1 AND game = 'blackjack' AND outcome->>'status' IN ${ACTIVE_STATUSES}
     ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  const round = result.rows[0];
  return round ? toPublicRound(round) : null;
}

module.exports = {
  startBlackjack,
  insuranceBlackjack,
  hitBlackjack,
  standBlackjack,
  doubleBlackjack,
  splitBlackjack,
  getBlackjackState,
};
