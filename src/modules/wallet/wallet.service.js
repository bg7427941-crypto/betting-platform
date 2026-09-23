const { query, withTransaction } = require('../../db');

// Mínimo de retiro — común en plataformas reales (evita procesar retiros
// de centavos) y calza con MIN_DEPOSIT_CENTS de abajo para que no haya un
// hueco raro donde podés depositar S/1 pero nunca retirarlo.
const MIN_WITHDRAW_CENTS = 1000; // S/10.00
const MIN_DEPOSIT_CENTS = 500; // S/5.00

// Bajar el límite de depósito diario (o ponerlo por primera vez) es
// inmediato. Subirlo o quitarlo entra en efecto recién a las 24h — mismo
// patrón que usan las plataformas reguladas, para que un impulso a mitad
// de una mala racha no pueda saltarse el límite que la persona se puso en frío.
const DEPOSIT_LIMIT_INCREASE_DELAY_HOURS = 24;

const WALLET_FIELDS = `
  id, balance_cents, currency,
  daily_deposit_limit_cents, pending_deposit_limit_cents, pending_deposit_limit_effective_at
`;

/** Si hay un aumento de límite pendiente y ya venció el plazo de espera,
 * lo aplica. Se llama de paso en cada lectura/depósito — no hace falta
 * un cron aparte para algo tan poco frecuente como esto. */
async function resolvePendingLimit(client, wallet) {
  if (wallet.pending_deposit_limit_effective_at && new Date(wallet.pending_deposit_limit_effective_at) <= new Date()) {
    const newLimit = wallet.pending_deposit_limit_cents; // puede ser null = sin límite
    await client.query(
      `UPDATE wallets
       SET daily_deposit_limit_cents = $1, pending_deposit_limit_cents = NULL, pending_deposit_limit_effective_at = NULL
       WHERE id = $2`,
      [newLimit, wallet.id]
    );
    wallet.daily_deposit_limit_cents = newLimit;
    wallet.pending_deposit_limit_cents = null;
    wallet.pending_deposit_limit_effective_at = null;
  }
  return wallet;
}

async function depositedToday(client, walletId) {
  const result = await client.query(
    `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS total
     FROM transactions
     WHERE wallet_id = $1 AND type = 'deposit' AND created_at::date = CURRENT_DATE`,
    [walletId]
  );
  return Number(result.rows[0].total);
}

async function getWallet(userId) {
  return withTransaction(async (client) => {
    const result = await client.query(`SELECT ${WALLET_FIELDS} FROM wallets WHERE user_id = $1`, [userId]);
    let wallet = result.rows[0];
    if (!wallet) {
      throw Object.assign(new Error('Billetera no encontrada'), { status: 404 });
    }
    wallet = await resolvePendingLimit(client, wallet);
    const depositedTodayCents = await depositedToday(client, wallet.id);
    return {
      ...wallet,
      deposited_today_cents: depositedTodayCents,
      remaining_today_cents:
        wallet.daily_deposit_limit_cents != null
          ? Math.max(0, wallet.daily_deposit_limit_cents - depositedTodayCents)
          : null,
    };
  });
}

/**
 * Depósito simulado (dinero ficticio). Cuando conectes una pasarela de pagos
 * real, este método es el que reemplazarías por la confirmación del webhook
 * del proveedor de pagos — nunca confíes en el monto que venga del frontend.
 */
async function deposit(userId, amountCents) {
  if (!Number.isInteger(amountCents) || amountCents < MIN_DEPOSIT_CENTS) {
    throw Object.assign(
      new Error(`El depósito mínimo es de S/ ${(MIN_DEPOSIT_CENTS / 100).toFixed(2)}`),
      { status: 400 }
    );
  }

  return withTransaction(async (client) => {
    const walletResult = await client.query(`SELECT ${WALLET_FIELDS} FROM wallets WHERE user_id = $1 FOR UPDATE`, [
      userId,
    ]);
    let wallet = walletResult.rows[0];
    if (!wallet) {
      throw Object.assign(new Error('Billetera no encontrada'), { status: 404 });
    }
    wallet = await resolvePendingLimit(client, wallet);

    if (wallet.daily_deposit_limit_cents != null) {
      const alreadyToday = await depositedToday(client, wallet.id);
      if (alreadyToday + amountCents > wallet.daily_deposit_limit_cents) {
        const remaining = Math.max(0, wallet.daily_deposit_limit_cents - alreadyToday);
        throw Object.assign(
          new Error(
            `Superarías tu límite de depósito diario. Te quedan S/ ${(remaining / 100).toFixed(2)} por hoy.`
          ),
          { status: 400 }
        );
      }
    }

    const newBalance = Number(wallet.balance_cents) + amountCents;

    await client.query(
      'UPDATE wallets SET balance_cents = $1, updated_at = now() WHERE id = $2',
      [newBalance, wallet.id]
    );

    await client.query(
      `INSERT INTO transactions (wallet_id, type, amount_cents, balance_after)
       VALUES ($1, 'deposit', $2, $3)`,
      [wallet.id, amountCents, newBalance]
    );

    return { balance_cents: newBalance };
  });
}

async function withdraw(userId, amountCents) {
  if (!Number.isInteger(amountCents) || amountCents < MIN_WITHDRAW_CENTS) {
    throw Object.assign(
      new Error(`El retiro mínimo es de S/ ${(MIN_WITHDRAW_CENTS / 100).toFixed(2)}`),
      { status: 400 }
    );
  }

  return withTransaction(async (client) => {
    const walletResult = await client.query(
      'SELECT id, balance_cents FROM wallets WHERE user_id = $1 FOR UPDATE',
      [userId]
    );
    const wallet = walletResult.rows[0];
    if (!wallet) {
      throw Object.assign(new Error('Billetera no encontrada'), { status: 404 });
    }
    if (Number(wallet.balance_cents) < amountCents) {
      throw Object.assign(new Error('Saldo insuficiente'), { status: 400 });
    }

    const newBalance = Number(wallet.balance_cents) - amountCents;

    await client.query(
      'UPDATE wallets SET balance_cents = $1, updated_at = now() WHERE id = $2',
      [newBalance, wallet.id]
    );

    await client.query(
      `INSERT INTO transactions (wallet_id, type, amount_cents, balance_after)
       VALUES ($1, 'withdraw', $2, $3)`,
      [wallet.id, -amountCents, newBalance]
    );

    return { balance_cents: newBalance };
  });
}

/**
 * Fija (o quita, con null) el límite de depósito diario del usuario.
 * Bajarlo (o ponerlo por primera vez, viniendo de "sin límite") es
 * inmediato. Subirlo o quitarlo queda "pendiente" 24h — ver
 * DEPOSIT_LIMIT_INCREASE_DELAY_HOURS arriba.
 */
async function setDepositLimit(userId, newLimitCents) {
  if (newLimitCents != null && (!Number.isInteger(newLimitCents) || newLimitCents <= 0)) {
    throw Object.assign(new Error('El límite debe ser un monto positivo, o null para quitarlo'), { status: 400 });
  }

  return withTransaction(async (client) => {
    const walletResult = await client.query(`SELECT ${WALLET_FIELDS} FROM wallets WHERE user_id = $1 FOR UPDATE`, [
      userId,
    ]);
    let wallet = walletResult.rows[0];
    if (!wallet) {
      throw Object.assign(new Error('Billetera no encontrada'), { status: 404 });
    }
    wallet = await resolvePendingLimit(client, wallet);

    const current = wallet.daily_deposit_limit_cents;
    const isIncrease = current != null && (newLimitCents == null || newLimitCents > current);

    if (isIncrease) {
      const effectiveAt = new Date(Date.now() + DEPOSIT_LIMIT_INCREASE_DELAY_HOURS * 60 * 60 * 1000);
      await client.query(
        `UPDATE wallets
         SET pending_deposit_limit_cents = $1, pending_deposit_limit_effective_at = $2
         WHERE id = $3`,
        [newLimitCents, effectiveAt, wallet.id]
      );
      return {
        daily_deposit_limit_cents: current,
        pending_deposit_limit_cents: newLimitCents,
        pending_deposit_limit_effective_at: effectiveAt,
      };
    }

    // Primera vez (sin límite -> con límite) o baja del límite: inmediato,
    // y de paso se cancela cualquier aumento que hubiera quedado pendiente.
    await client.query(
      `UPDATE wallets
       SET daily_deposit_limit_cents = $1, pending_deposit_limit_cents = NULL, pending_deposit_limit_effective_at = NULL
       WHERE id = $2`,
      [newLimitCents, wallet.id]
    );
    return {
      daily_deposit_limit_cents: newLimitCents,
      pending_deposit_limit_cents: null,
      pending_deposit_limit_effective_at: null,
    };
  });
}

async function getHistory(userId, { limit = 50, offset = 0 } = {}) {
  const result = await query(
    `SELECT t.id, t.type, t.amount_cents, t.balance_after, t.created_at
     FROM transactions t
     JOIN wallets w ON w.id = t.wallet_id
     WHERE w.user_id = $1
     ORDER BY t.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return result.rows;
}

module.exports = {
  getWallet,
  deposit,
  withdraw,
  getHistory,
  setDepositLimit,
  MIN_WITHDRAW_CENTS,
  MIN_DEPOSIT_CENTS,
};
