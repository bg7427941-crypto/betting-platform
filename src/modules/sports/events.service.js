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

/**
 * Uso administrativo: todos los eventos sin importar estado (incluye
 * finalizados/cancelados), con el conteo de cuotas activas y apuestas
 * pendientes de cada uno — lo que necesita el panel de admin para decidir
 * qué evento cargar cuotas o finalizar.
 */
async function listAllEventsAdmin() {
  const result = await query(
    `SELECT
       e.id, e.sport, e.home_team, e.away_team, e.starts_at, e.status, e.result,
       COUNT(DISTINCT o.id) FILTER (WHERE o.is_active) AS odds_count,
       COUNT(DISTINCT b.id) FILTER (WHERE b.status = 'pending') AS pending_bets_count
     FROM sport_events e
     LEFT JOIN odds o ON o.event_id = e.id
     LEFT JOIN bets b ON b.event_id = e.id
     GROUP BY e.id
     ORDER BY e.starts_at DESC`
  );
  return result.rows.map((row) => ({
    ...row,
    odds_count: Number(row.odds_count),
    pending_bets_count: Number(row.pending_bets_count),
  }));
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

function isNonEmptyString(value, maxLength) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

/**
 * Uso administrativo: crear un evento manualmente (mientras no tengas
 * integrada una API externa de resultados/cuotas).
 */
async function createEvent({ sport, homeTeam, awayTeam, startsAt }) {
  if (!isNonEmptyString(sport, 50) || !isNonEmptyString(homeTeam, 100) || !isNonEmptyString(awayTeam, 100)) {
    throw Object.assign(
      new Error('sport, homeTeam y awayTeam son obligatorios y deben ser texto no vacío'),
      { status: 400 }
    );
  }
  if (homeTeam.trim() === awayTeam.trim()) {
    throw Object.assign(new Error('homeTeam y awayTeam no pueden ser el mismo equipo'), { status: 400 });
  }

  const startsAtDate = new Date(startsAt);
  if (Number.isNaN(startsAtDate.getTime())) {
    throw Object.assign(new Error('startsAt debe ser una fecha válida'), { status: 400 });
  }
  if (startsAtDate.getTime() <= Date.now()) {
    throw Object.assign(new Error('startsAt debe ser una fecha futura'), { status: 400 });
  }

  const result = await query(
    `INSERT INTO sport_events (sport, home_team, away_team, starts_at)
     VALUES ($1, $2, $3, $4)
     RETURNING id, sport, home_team, away_team, starts_at, status`,
    [sport, homeTeam, awayTeam, startsAtDate.toISOString()]
  );
  return result.rows[0];
}

const MIN_ODDS_PRICE = 1.01; // por debajo de esto no tiene sentido (pagaría menos que el stake)
const MAX_ODDS_PRICE = 1000; // límite de seguridad contra errores de tipeo (ej. agregar un cero de más)

async function setOdds(eventId, market, selection, price) {
  if (!isNonEmptyString(eventId, 100)) {
    throw Object.assign(new Error('eventId inválido'), { status: 400 });
  }
  if (!isNonEmptyString(market, 30) || !isNonEmptyString(selection, 30)) {
    throw Object.assign(new Error('market y selection son obligatorios'), { status: 400 });
  }

  const priceNum = Number(price);
  if (!Number.isFinite(priceNum) || priceNum < MIN_ODDS_PRICE || priceNum > MAX_ODDS_PRICE) {
    throw Object.assign(
      new Error(`price debe ser un número entre ${MIN_ODDS_PRICE} y ${MAX_ODDS_PRICE}`),
      { status: 400 }
    );
  }

  const eventExists = await query('SELECT id FROM sport_events WHERE id = $1', [eventId]);
  if (eventExists.rows.length === 0) {
    throw Object.assign(new Error('Evento no encontrado'), { status: 404 });
  }

  const result = await query(
    `INSERT INTO odds (event_id, market, selection, price)
     VALUES ($1, $2, $3, $4)
     RETURNING id, market, selection, price`,
    [eventId, market, selection, priceNum]
  );
  return result.rows[0];
}

// Nota: finalizar un evento ("finishEvent") ya no vive acá — se unificó con
// la liquidación de apuestas en una sola transacción atómica. Ver
// settlement.service.js -> finishAndSettleEvent().

module.exports = {
  listUpcomingEvents,
  listAllEventsAdmin,
  getEventWithOdds,
  createEvent,
  setOdds,
};
