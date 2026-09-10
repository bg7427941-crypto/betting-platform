const { withTransaction } = require('../../db');

const VALID_RESULTS = new Set(['home', 'away', 'draw']);

/**
 * Marca el evento como finalizado y liquida todas sus apuestas pendientes,
 * todo dentro de UNA sola transacción SQL (antes eran dos pasos separados:
 * finishEvent() y luego settleEvent(), lo que podía dejar el evento
 * "finished" pero sin liquidar si el segundo paso fallaba a mitad de camino).
 * - Si la selección de la apuesta coincide con el resultado -> gana, se paga stake * price.
 * - Si no coincide -> pierde, no se paga nada (el stake ya se descontó al apostar).
 */
async function finishAndSettleEvent(eventId, result) {
  if (!VALID_RESULTS.has(result)) {
    throw Object.assign(
      new Error(`result debe ser uno de: ${[...VALID_RESULTS].join(', ')}`),
      { status: 400 }
    );
  }

  return withTransaction(async (client) => {
    const eventResult = await client.query(
      `SELECT id, status FROM sport_events WHERE id = $1 FOR UPDATE`,
      [eventId]
    );
    const event = eventResult.rows[0];
    if (!event) {
      throw Object.assign(new Error('Evento no encontrado'), { status: 404 });
    }
    if (event.status === 'finished') {
      throw Object.assign(new Error('Este evento ya fue finalizado'), { status: 409 });
    }

    await client.query(
      `UPDATE sport_events SET status = 'finished', result = $2 WHERE id = $1`,
      [eventId, result]
    );

    // Apuestas pendientes de este evento, con la selección de su cuota
    const betsResult = await client.query(
      `SELECT b.id, b.user_id, b.stake_cents, b.price_taken, o.selection
       FROM bets b
       JOIN odds o ON o.id = b.odds_id
       WHERE b.event_id = $1 AND b.status = 'pending'
       FOR UPDATE`,
      [eventId]
    );

    const settled = [];

    for (const bet of betsResult.rows) {
      const won = bet.selection === result;
      const payoutCents = won
        ? Math.round(Number(bet.stake_cents) * Number(bet.price_taken))
        : 0;

      await client.query(
        `UPDATE bets
         SET status = $2, payout_cents = $3, settled_at = now()
         WHERE id = $1`,
        [bet.id, won ? 'won' : 'lost', payoutCents]
      );

      if (won && payoutCents > 0) {
        const walletResult = await client.query(
          `SELECT id, balance_cents FROM wallets WHERE user_id = $1 FOR UPDATE`,
          [bet.user_id]
        );
        const wallet = walletResult.rows[0];
        const newBalance = Number(wallet.balance_cents) + payoutCents;

        await client.query(
          `UPDATE wallets SET balance_cents = $1, updated_at = now() WHERE id = $2`,
          [newBalance, wallet.id]
        );

        await client.query(
          `INSERT INTO transactions (wallet_id, type, amount_cents, balance_after, reference_type, reference_id)
           VALUES ($1, 'bet_payout', $2, $3, 'bet', $4)`,
          [wallet.id, payoutCents, newBalance, bet.id]
        );
      }

      settled.push({ bet_id: bet.id, status: won ? 'won' : 'lost', payout_cents: payoutCents });
    }

    return { event_id: eventId, result, settled_count: settled.length, settled };
  });
}

module.exports = { finishAndSettleEvent };
