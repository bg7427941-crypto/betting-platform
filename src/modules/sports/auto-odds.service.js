const { withTransaction } = require('../../db');
const oddsEngine = require('../teams/odds-engine');

/**
 * Calcula cuotas 1x2 (o local/visita) automáticamente para un evento ya
 * vinculado a dos equipos registrados, usando sus estadísticas actuales
 * (ver odds-engine.js para el detalle de los modelos). Desactiva las
 * cuotas '1x2' previas del evento y crea las nuevas, todo en una
 * transacción — así nunca queda el evento sin cuotas activas a mitad de
 * camino.
 */
async function calculateAndSaveOdds(eventId, { marginRate } = {}) {
  if (marginRate !== undefined) {
    const m = Number(marginRate);
    if (!Number.isFinite(m) || m < 0 || m > 0.5) {
      throw Object.assign(new Error('marginRate debe ser un número entre 0 y 0.5 (0% a 50%)'), { status: 400 });
    }
  }

  return withTransaction(async (client) => {
    const eventResult = await client.query(
      `SELECT id, sport, status, home_team_id, away_team_id FROM sport_events WHERE id = $1 FOR UPDATE`,
      [eventId]
    );
    const event = eventResult.rows[0];
    if (!event) {
      throw Object.assign(new Error('Evento no encontrado'), { status: 404 });
    }
    if (event.status === 'finished' || event.status === 'cancelled') {
      throw Object.assign(new Error('No se pueden calcular cuotas para un evento ya cerrado'), { status: 409 });
    }
    if (!event.home_team_id || !event.away_team_id) {
      throw Object.assign(
        new Error('Este evento no está vinculado a equipos registrados (créalo eligiendo equipos de la lista)'),
        { status: 400 }
      );
    }

    const teamsResult = await client.query(
      `SELECT id, name, sport, attack_rating, defense_rating, elo_rating
       FROM teams WHERE id IN ($1, $2)`,
      [event.home_team_id, event.away_team_id]
    );
    const homeTeam = teamsResult.rows.find((t) => t.id === event.home_team_id);
    const awayTeam = teamsResult.rows.find((t) => t.id === event.away_team_id);
    if (!homeTeam || !awayTeam) {
      throw Object.assign(new Error('Alguno de los equipos vinculados ya no existe'), { status: 404 });
    }

    const calc = oddsEngine.calculateMatchOdds({ sport: event.sport, homeTeam, awayTeam, marginRate });

    // Desactivar cuotas 1x2 previas (no las borramos: apuestas ya hechas
    // referencian su odds_id, así que hay que conservar la fila).
    await client.query(
      `UPDATE odds SET is_active = false, updated_at = now()
       WHERE event_id = $1 AND market = '1x2' AND is_active = true`,
      [eventId]
    );

    const insertedOdds = [];
    for (const [selection, price] of Object.entries(calc.odds)) {
      if (price === null) continue;
      const inserted = await client.query(
        `INSERT INTO odds (event_id, market, selection, price)
         VALUES ($1, '1x2', $2, $3)
         RETURNING id, market, selection, price`,
        [eventId, selection, price]
      );
      insertedOdds.push(inserted.rows[0]);
    }

    return {
      event_id: eventId,
      model: calc.model,
      probabilities: calc.probabilities,
      expected_goals: calc.expected_goals || null,
      odds: insertedOdds,
    };
  });
}

module.exports = { calculateAndSaveOdds };
