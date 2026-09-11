const { withTransaction } = require('../../db');

/**
 * Coloca una apuesta deportiva: valida la cuota, descuenta el saldo y crea
 * el registro de apuesta, todo en una sola transacción SQL.
 */
async function placeBet(userId, { eventId, oddsId, stakeCents }) {
  if (!Number.isInteger(stakeCents) || stakeCents <= 0) {
    throw Object.assign(new Error('Monto de apuesta inválido'), { status: 400 });
  }

  return withTransaction(async (client) => {
    // 1. Verificar que el evento siga abierto para apostar — el corte real
    // es por tiempo (starts_at <= ahora ya no admite apuestas nuevas, sin
    // depender de que alguien haya actualizado el status a mano).
    const eventResult = await client.query(
      `SELECT id, status, starts_at FROM sport_events WHERE id = $1 FOR UPDATE`,
      [eventId]
    );
    const event = eventResult.rows[0];
    if (!event) {
      throw Object.assign(new Error('Evento no encontrado'), { status: 404 });
    }
    if (event.status !== 'scheduled') {
      throw Object.assign(new Error('Este evento ya no admite apuestas'), { status: 400 });
    }
    if (new Date(event.starts_at).getTime() <= Date.now()) {
      throw Object.assign(new Error('Las apuestas para este evento ya cerraron (el partido ya empezó)'), {
        status: 400,
      });
    }

    // 2. Verificar que la cuota exista, esté activa y pertenezca al evento
    const oddsResult = await client.query(
      `SELECT id, price FROM odds WHERE id = $1 AND event_id = $2 AND is_active = true`,
      [oddsId, eventId]
    );
    const odds = oddsResult.rows[0];
    if (!odds) {
      throw Object.assign(new Error('Cuota no válida o ya no disponible'), { status: 400 });
    }

    // 3. Bloquear y verificar saldo suficiente
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

    // 4. Descontar saldo
    const newBalance = Number(wallet.balance_cents) - stakeCents;
    await client.query(
      `UPDATE wallets SET balance_cents = $1, updated_at = now() WHERE id = $2`,
      [newBalance, wallet.id]
    );

    // 5. Crear la apuesta (con la cuota congelada al momento de apostar)
    const betResult = await client.query(
      `INSERT INTO bets (user_id, event_id, odds_id, stake_cents, price_taken, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING id, event_id, odds_id, stake_cents, price_taken, status, created_at`,
      [userId, eventId, oddsId, stakeCents, odds.price]
    );
    const bet = betResult.rows[0];

    // 6. Registrar la transacción de billetera, referenciando la apuesta
    await client.query(
      `INSERT INTO transactions (wallet_id, type, amount_cents, balance_after, reference_type, reference_id)
       VALUES ($1, 'bet_stake', $2, $3, 'bet', $4)`,
      [wallet.id, -stakeCents, newBalance, bet.id]
    );

    return { bet, balance_cents: newBalance };
  });
}

module.exports = { placeBet };
