const { withTransaction } = require('../../db');
const { spinRouletteWheel, resolveRouletteBet, playSlots } = require('./games.engine');

const MAX_STAKE_CENTS = 100_000_00; // límite de seguridad total por giro

async function playRoulette(userId, bets) {
  if (!Array.isArray(bets) || bets.length === 0) {
    throw Object.assign(new Error('Debes colocar al menos una apuesta'), { status: 400 });
  }

  let totalStakeCents = 0;
  for (const bet of bets) {
    if (!Number.isInteger(bet.stakeCents) || bet.stakeCents <= 0) {
      throw Object.assign(new Error('Cada apuesta debe tener un monto válido'), { status: 400 });
    }
    totalStakeCents += bet.stakeCents;
  }
  if (totalStakeCents > MAX_STAKE_CENTS) {
    throw Object.assign(new Error('El total apostado excede el máximo permitido'), { status: 400 });
  }

  return withTransaction(async (client) => {
    const walletResult = await client.query(
      `SELECT id, balance_cents FROM wallets WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );
    const wallet = walletResult.rows[0];
    if (!wallet) {
      throw Object.assign(new Error('Billetera no encontrada'), { status: 404 });
    }
    if (Number(wallet.balance_cents) < totalStakeCents) {
      throw Object.assign(new Error('Saldo insuficiente'), { status: 400 });
    }

    // Un solo giro para TODAS las apuestas de esta ronda (así funciona una mesa real)
    const { winningNumber, color } = spinRouletteWheel();

    let totalPayoutCents = 0;
    const resolvedBets = bets.map((bet) => {
      const { won, multiplier } = resolveRouletteBet(bet, winningNumber, color);
      const payoutCents = won ? Math.round(bet.stakeCents * multiplier) : 0;
      totalPayoutCents += payoutCents;
      return { type: bet.type, value: bet.value ?? null, stakeCents: bet.stakeCents, won, payoutCents };
    });

    const netCents = totalPayoutCents - totalStakeCents;
    const newBalance = Number(wallet.balance_cents) + netCents;

    await client.query(
      `UPDATE wallets SET balance_cents = $1, updated_at = now() WHERE id = $2`,
      [newBalance, wallet.id]
    );

    const outcome = { winningNumber, color, bets: resolvedBets };

    const roundResult = await client.query(
      `INSERT INTO casino_rounds (user_id, game, stake_cents, outcome, payout_cents)
       VALUES ($1, 'roulette', $2, $3, $4)
       RETURNING id, game, stake_cents, outcome, payout_cents, created_at`,
      [userId, totalStakeCents, JSON.stringify(outcome), totalPayoutCents]
    );
    const round = roundResult.rows[0];

    await client.query(
      `INSERT INTO transactions (wallet_id, type, amount_cents, balance_after, reference_type, reference_id)
       VALUES ($1, 'bet_stake', $2, $3, 'casino_round', $4)`,
      [wallet.id, -totalStakeCents, Number(wallet.balance_cents) - totalStakeCents, round.id]
    );
    if (totalPayoutCents > 0) {
      await client.query(
        `INSERT INTO transactions (wallet_id, type, amount_cents, balance_after, reference_type, reference_id)
         VALUES ($1, 'bet_payout', $2, $3, 'casino_round', $4)`,
        [wallet.id, totalPayoutCents, newBalance, round.id]
      );
    }

    return { round, balance_cents: newBalance };
  });
}

// "Apuesta ante" (como el Bet+ de otros proveedores): pagar más por giro
// a cambio de mayor probabilidad de scatter. 'none' es el juego normal.
const ANTE_TIERS = {
  none: { costMultiplier: 1, scatterBoost: 1 },
  ante25: { costMultiplier: 1.25, scatterBoost: 1.5 },
  ante50: { costMultiplier: 1.5, scatterBoost: 2 },
  ante100: { costMultiplier: 2, scatterBoost: 3 },
};

// Comprar el bono: paga un múltiplo fijo de la apuesta base y el scatter
// (3+) queda garantizado en ese mismo giro. Es una apuesta cara a propósito.
const BUY_BONUS_COST_MULTIPLIER = 100;

async function playSlotsRound(userId, { stakeCents, buyBonus = false, anteTier = 'none' }) {
  if (!Number.isInteger(stakeCents) || stakeCents <= 0) {
    throw Object.assign(new Error('Monto de apuesta inválido'), { status: 400 });
  }
  if (stakeCents > MAX_STAKE_CENTS) {
    throw Object.assign(new Error('Monto de apuesta excede el máximo permitido'), { status: 400 });
  }

  const tier = ANTE_TIERS[anteTier];
  if (!tier) {
    throw Object.assign(new Error('Nivel de apuesta ante inválido'), { status: 400 });
  }

  const costCents = buyBonus
    ? Math.round(stakeCents * BUY_BONUS_COST_MULTIPLIER)
    : Math.round(stakeCents * tier.costMultiplier);

  if (costCents > MAX_STAKE_CENTS) {
    throw Object.assign(new Error('El costo del giro excede el máximo permitido'), { status: 400 });
  }

  return withTransaction(async (client) => {
    const walletResult = await client.query(
      `SELECT id, balance_cents FROM wallets WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );
    const wallet = walletResult.rows[0];
    if (!wallet) {
      throw Object.assign(new Error('Billetera no encontrada'), { status: 404 });
    }
    if (Number(wallet.balance_cents) < costCents) {
      throw Object.assign(new Error('Saldo insuficiente'), { status: 400 });
    }

    const outcome = buyBonus
      ? playSlots({ guaranteeBonus: true })
      : playSlots({ scatterBoost: tier.scatterBoost });

    // Los pagos de líneas/scatter son múltiplos de la apuesta BASE elegida
    // por el jugador, no del costo real cobrado (así es como funcionan
    // estas mecánicas en los juegos reales: el ante/bono es un costo de
    // entrada aparte, no cambia la tabla de pagos).
    const payoutCents = Math.round(stakeCents * outcome.multiplier);
    const netCents = payoutCents - costCents;
    const newBalance = Number(wallet.balance_cents) + netCents;

    await client.query(
      `UPDATE wallets SET balance_cents = $1, updated_at = now() WHERE id = $2`,
      [newBalance, wallet.id]
    );

    const roundResult = await client.query(
      `INSERT INTO casino_rounds (user_id, game, stake_cents, outcome, payout_cents)
       VALUES ($1, 'slots', $2, $3, $4)
       RETURNING id, game, stake_cents, outcome, payout_cents, created_at`,
      [userId, costCents, JSON.stringify({ ...outcome, betCents: stakeCents, costCents, buyBonus, anteTier }), payoutCents]
    );
    const round = roundResult.rows[0];

    await client.query(
      `INSERT INTO transactions (wallet_id, type, amount_cents, balance_after, reference_type, reference_id)
       VALUES ($1, 'bet_stake', $2, $3, 'casino_round', $4)`,
      [wallet.id, -costCents, Number(wallet.balance_cents) - costCents, round.id]
    );
    if (payoutCents > 0) {
      await client.query(
        `INSERT INTO transactions (wallet_id, type, amount_cents, balance_after, reference_type, reference_id)
         VALUES ($1, 'bet_payout', $2, $3, 'casino_round', $4)`,
        [wallet.id, payoutCents, newBalance, round.id]
      );
    }

    return { round, balance_cents: newBalance };
  });
}

/**
 * Punto de entrada único usado por las rutas.
 * roulette: payload = { bets: [{ type, value?, stakeCents }, ...] }
 * slots:    payload = { stakeCents, buyBonus?, anteTier? }
 */
async function playRound(userId, { game, bets, stakeCents, buyBonus, anteTier }) {
  if (game === 'roulette') return playRoulette(userId, bets);
  if (game === 'slots') return playSlotsRound(userId, { stakeCents, buyBonus, anteTier });
  throw Object.assign(new Error('Juego no soportado'), { status: 400 });
}

/** Config pública para que el frontend muestre los costos exactos, sin duplicar números mágicos. */
function getSlotsConfig() {
  return { anteTiers: ANTE_TIERS, buyBonusCostMultiplier: BUY_BONUS_COST_MULTIPLIER };
}

module.exports = { playRound, getSlotsConfig };