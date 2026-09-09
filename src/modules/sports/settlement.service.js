const { withTransaction } = require('../../db');

/**
 * Liquida todas las apuestas pendientes de un evento ya finalizado.
 * - Si la selección de la apuesta coincide con el resultado -> gana, se paga stake * price.
 * - Si no coincide -> pierde, no se paga nada (el stake ya se descontó al apostar).
 * Se corre dentro de una transacción para que el pago de cada apuesta y su
 * transacción de wallet queden consistentes.
 */
async function settleEvent(eventId) {
  return withTransaction(async (client) => {
    const eventResult = await client.query(
      `SELECT id, status, result FROM sport_events WHERE id = $1 FOR UPDATE`,
      [eventId]
    );
    const event = eventResult.rows[0];
    if (!event) {
      throw Object.assign(new Error('Evento no encontrado'), { status: 404 });
    }
    if (event.status !== 'finished' || !event.result) {
      throw Object.assign(
        new Error('El evento debe estar finalizado con un resultado antes de liquidar'),
        { status: 400 }
      );
    }

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
      const won = bet.selection === event.result;
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

    return { event_id: eventId, settled_count: settled.length, settled };
  });
}

module.exports = { settleEvent };
