const { query } = require('../../db');

/**
 * Resumen agregado para el panel de administración. Son varias queries
 * de solo lectura (no tocan saldo, no necesitan transacción) que corren
 * en paralelo.
 */
async function getDashboardSummary() {
  const [usersResult, walletResult, eventsResult, betsResult, casinoResult] = await Promise.all([
    query(`SELECT COUNT(*)::int AS total_users FROM users WHERE is_active = true`),

    query(`SELECT COALESCE(SUM(balance_cents), 0)::bigint AS total_balance_cents FROM wallets`),

    query(`SELECT status, COUNT(*)::int AS count FROM sport_events GROUP BY status`),

    query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_count,
         COALESCE(SUM(stake_cents) FILTER (WHERE status = 'pending'), 0)::bigint AS pending_stake_cents,
         COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE)::int AS today_count
       FROM bets`
    ),

    query(
      `SELECT
         COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE)::int AS rounds_today_count,
         COALESCE(SUM(stake_cents) FILTER (WHERE created_at::date = CURRENT_DATE), 0)::bigint AS stake_today_cents,
         COALESCE(SUM(payout_cents) FILTER (WHERE created_at::date = CURRENT_DATE), 0)::bigint AS payout_today_cents
       FROM casino_rounds`
    ),
  ]);

  const eventsByStatus = eventsResult.rows.reduce((acc, row) => {
    acc[row.status] = row.count;
    return acc;
  }, {});

  const stakeToday = Number(casinoResult.rows[0].stake_today_cents);
  const payoutToday = Number(casinoResult.rows[0].payout_today_cents);

  return {
    total_users: usersResult.rows[0].total_users,
    total_wallet_balance_cents: Number(walletResult.rows[0].total_balance_cents),
    events_by_status: {
      scheduled: eventsByStatus.scheduled || 0,
      live: eventsByStatus.live || 0,
      finished: eventsByStatus.finished || 0,
      cancelled: eventsByStatus.cancelled || 0,
    },
    bets: {
      pending_count: betsResult.rows[0].pending_count,
      pending_stake_cents: Number(betsResult.rows[0].pending_stake_cents),
      today_count: betsResult.rows[0].today_count,
    },
    casino: {
      rounds_today_count: casinoResult.rows[0].rounds_today_count,
      stake_today_cents: stakeToday,
      payout_today_cents: payoutToday,
      house_net_today_cents: stakeToday - payoutToday,
    },
  };
}

module.exports = { getDashboardSummary };
