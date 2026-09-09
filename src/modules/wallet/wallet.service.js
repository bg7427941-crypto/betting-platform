const { query, withTransaction } = require('../../db');

async function getWallet(userId) {
  const result = await query(
    'SELECT id, balance_cents, currency FROM wallets WHERE user_id = $1',
    [userId]
  );
  if (result.rows.length === 0) {
    throw Object.assign(new Error('Billetera no encontrada'), { status: 404 });
  }
  return result.rows[0];
}

/**
 * Depósito simulado (dinero ficticio). Cuando conectes una pasarela de pagos
 * real, este método es el que reemplazarías por la confirmación del webhook
 * del proveedor de pagos — nunca confíes en el monto que venga del frontend.
 */
async function deposit(userId, amountCents) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw Object.assign(new Error('Monto inválido'), { status: 400 });
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
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw Object.assign(new Error('Monto inválido'), { status: 400 });
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

module.exports = { getWallet, deposit, withdraw, getHistory };
