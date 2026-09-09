const { withTransaction } = require('../../db');
const { playRoulette, playSlots } = require('./games.engine');

const MAX_STAKE_CENTS = 100_000_00; // límite de seguridad, ajústalo a tu gusto

async function playRound(userId, { game, stakeCents, bet }) {
  if (!Number.isInteger(stakeCents) || stakeCents <= 0) {
    throw Object.assign(new Error('Monto de apuesta inválido'), { status: 400 });
  }
  if (stakeCents > MAX_STAKE_CENTS) {
    throw Object.assign(new Error('Monto de apuesta excede el máximo permitido'), { status: 400 });
  }
  if (!['roulette', 'slots'].includes(game)) {
    throw Object.assign(new Error('Juego no soportado'), { status: 400 });
  }

  return withTransaction(async (client) => {
    // 1. Bloquear billetera y verificar saldo
    const walletResult = await client.query(
      `SELECT id, balance_cents FROM wallets WHERE user_id = $1 FOR UPDATE`,
      [userId]
    );
    const wallet = walletResult.rows[0];
    if (!wallet) {
      throw Object.assign(new Error('Billetera no encontrada'), { status: 404 });
    }
    if (Number(wallet.balance_cents) < stakeCents) {
      throw Object.assign(new Error('Saldo insuficiente'), { status: 400 });
    }

    // 2. Resolver la ronda (el resultado se calcula ANTES de tocar la DB,
    //    para que el RNG nunca dependa de nada persistido)
    const outcome = game === 'roulette' ? playRoulette(bet || {}) : playSlots();
    const payoutCents = Math.round(stakeCents * outcome.multiplier);

    // 3. Aplicar el neto (pierde el stake, gana el payout) en un solo update
    const netCents = payoutCents - stakeCents;
    const newBalance = Number(wallet.balance_cents) + netCents;

    await client.query(
      `UPDATE wallets SET balance_cents = $1, updated_at = now() WHERE id = $2`,
      [newBalance, wallet.id]
    );

    // 4. Guardar la ronda para historial/auditoría
    const roundResult = await client.query(
      `INSERT INTO casino_rounds (user_id, game, stake_cents, outcome, payout_cents)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, game, stake_cents, outcome, payout_cents, created_at`,
      [userId, game, stakeCents, JSON.stringify(outcome), payoutCents]
    );
    const round = roundResult.rows[0];

    // 5. Registrar transacción de billetera referenciando la ronda
    await client.query(
      `INSERT INTO transactions (wallet_id, type, amount_cents, balance_after, reference_type, reference_id)
       VALUES ($1, 'bet_stake', $2, $3, 'casino_round', $4)`,
      [wallet.id, -stakeCents, Number(wallet.balance_cents) - stakeCents, round.id]
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

module.exports = { playRound };
