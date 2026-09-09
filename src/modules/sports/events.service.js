const { query } = require('../../db');

async function listUpcomingEvents() {
  const result = await query(
    `SELECT id, sport, home_team, away_team, starts_at, status
     FROM sport_events
     WHERE status IN ('scheduled', 'live')
     ORDER BY starts_at ASC`
  );
  return result.rows;
}

async function getEventWithOdds(eventId) {
  const eventResult = await query(
    `SELECT id, sport, home_team, away_team, starts_at, status, result
     FROM sport_events WHERE id = $1`,
    [eventId]
  );
  const event = eventResult.rows[0];
  if (!event) {
    throw Object.assign(new Error('Evento no encontrado'), { status: 404 });
  }

  const oddsResult = await query(
    `SELECT id, market, selection, price
     FROM odds
     WHERE event_id = $1 AND is_active = true
     ORDER BY market, selection`,
    [eventId]
  );

  return { ...event, odds: oddsResult.rows };
}

/**
 * Uso administrativo: crear un evento manualmente (mientras no tengas
 * integrada una API externa de resultados/cuotas).
 */
async function createEvent({ sport, homeTeam, awayTeam, startsAt }) {
  const result = await query(
    `INSERT INTO sport_events (sport, home_team, away_team, starts_at)
     VALUES ($1, $2, $3, $4)
     RETURNING id, sport, home_team, away_team, starts_at, status`,
    [sport, homeTeam, awayTeam, startsAt]
  );
  return result.rows[0];
}

async function setOdds(eventId, market, selection, price) {
  const result = await query(
    `INSERT INTO odds (event_id, market, selection, price)
     VALUES ($1, $2, $3, $4)
     RETURNING id, market, selection, price`,
    [eventId, market, selection, price]
  );
  return result.rows[0];
}

/**
 * Marca un evento como finalizado con un resultado ('home' | 'away' | 'draw').
 * Esto dispara la liquidación de todas las apuestas pendientes de ese evento.
 */
async function finishEvent(eventId, result) {
  const updated = await query(
    `UPDATE sport_events SET status = 'finished', result = $2
     WHERE id = $1 AND status != 'finished'
     RETURNING id`,
    [eventId, result]
  );
  if (updated.rows.length === 0) {
    throw Object.assign(new Error('Evento no encontrado o ya finalizado'), { status: 404 });
  }
  return updated.rows[0];
}

module.exports = {
  listUpcomingEvents,
  getEventWithOdds,
  createEvent,
  setOdds,
  finishEvent,
};
