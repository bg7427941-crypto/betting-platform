const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Ejecuta una query simple.
 */
function query(text, params) {
  return pool.query(text, params);
}

/**
 * Ejecuta una función dentro de una transacción SQL.
 * Uso: await withTransaction(async (client) => { ... });
 * Todo lo que toque saldo (wallet) DEBE pasar por aquí.
 */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
