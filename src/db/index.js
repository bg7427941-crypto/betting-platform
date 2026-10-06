const { Pool } = require('pg');

// SSL: Supabase (y la mayoría de Postgres administrados) lo exigen.
// - En producción se activa solo.
// - Se puede forzar con DATABASE_SSL=true / apagar con DATABASE_SSL=false
//   (útil para Postgres local sin SSL).
const useSsl =
  process.env.DATABASE_SSL === 'true' ||
  (process.env.DATABASE_SSL !== 'false' && process.env.NODE_ENV === 'production');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  // Plan gratuito de Supabase: pocas conexiones simultáneas, así que
  // mantenemos el pool chico y soltamos las inactivas.
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Sin este handler, si el pooler corta una conexión inactiva, el error
// llega como "unhandled" y tumba todo el proceso (y las mesas en vivo).
pool.on('error', (err) => {
  console.error('Error en conexión inactiva del pool (se ignora):', err.message);
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
