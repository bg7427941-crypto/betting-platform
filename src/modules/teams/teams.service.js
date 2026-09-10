const { query } = require('../../db');

const VALID_SPORTS = new Set(['futbol', 'basket', 'tenis', 'voley']);

function isNonEmptyString(value, maxLength) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function assertValidSport(sport) {
  if (!VALID_SPORTS.has(sport)) {
    throw Object.assign(
      new Error(`sport debe ser uno de: ${[...VALID_SPORTS].join(', ')}`),
      { status: 400 }
    );
  }
}

async function listTeams(sport) {
  if (sport) {
    assertValidSport(sport);
    const result = await query(
      `SELECT id, name, sport, attack_rating, defense_rating, elo_rating, notes, updated_at
       FROM teams WHERE sport = $1 ORDER BY name ASC`,
      [sport]
    );
    return result.rows;
  }
  const result = await query(
    `SELECT id, name, sport, attack_rating, defense_rating, elo_rating, notes, updated_at
     FROM teams ORDER BY sport ASC, name ASC`
  );
  return result.rows;
}

async function getTeam(id) {
  const result = await query(
    `SELECT id, name, sport, attack_rating, defense_rating, elo_rating, notes, updated_at
     FROM teams WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

const MIN_RATING = 0.1;
const MAX_RATING = 10;
const MIN_ELO = 100;
const MAX_ELO = 4000;

function validateRatings({ attackRating, defenseRating, eloRating }) {
  if (attackRating !== undefined) {
    const n = Number(attackRating);
    if (!Number.isFinite(n) || n < MIN_RATING || n > MAX_RATING) {
      throw Object.assign(
        new Error(`attackRating debe ser un número entre ${MIN_RATING} y ${MAX_RATING}`),
        { status: 400 }
      );
    }
  }
  if (defenseRating !== undefined) {
    const n = Number(defenseRating);
    if (!Number.isFinite(n) || n < MIN_RATING || n > MAX_RATING) {
      throw Object.assign(
        new Error(`defenseRating debe ser un número entre ${MIN_RATING} y ${MAX_RATING}`),
        { status: 400 }
      );
    }
  }
  if (eloRating !== undefined) {
    const n = Number(eloRating);
    if (!Number.isFinite(n) || n < MIN_ELO || n > MAX_ELO) {
      throw Object.assign(
        new Error(`eloRating debe ser un número entre ${MIN_ELO} y ${MAX_ELO}`),
        { status: 400 }
      );
    }
  }
}

async function createTeam({ name, sport, attackRating, defenseRating, eloRating, notes }) {
  if (!isNonEmptyString(name, 100)) {
    throw Object.assign(new Error('name es obligatorio'), { status: 400 });
  }
  assertValidSport(sport);
  validateRatings({ attackRating, defenseRating, eloRating });

  const result = await query(
    `INSERT INTO teams (name, sport, attack_rating, defense_rating, elo_rating, notes)
     VALUES ($1, $2, COALESCE($3, 1.000), COALESCE($4, 1.000), COALESCE($5, 1500.00), $6)
     RETURNING id, name, sport, attack_rating, defense_rating, elo_rating, notes, updated_at`,
    [name.trim(), sport, attackRating, defenseRating, eloRating, notes || null]
  );
  return result.rows[0];
}

async function updateTeamStats(id, { attackRating, defenseRating, eloRating, notes }) {
  validateRatings({ attackRating, defenseRating, eloRating });

  const existing = await getTeam(id);
  if (!existing) {
    throw Object.assign(new Error('Equipo no encontrado'), { status: 404 });
  }

  const result = await query(
    `UPDATE teams SET
       attack_rating = COALESCE($2, attack_rating),
       defense_rating = COALESCE($3, defense_rating),
       elo_rating = COALESCE($4, elo_rating),
       notes = COALESCE($5, notes),
       updated_at = now()
     WHERE id = $1
     RETURNING id, name, sport, attack_rating, defense_rating, elo_rating, notes, updated_at`,
    [id, attackRating, defenseRating, eloRating, notes]
  );
  return result.rows[0];
}

module.exports = { VALID_SPORTS, listTeams, getTeam, createTeam, updateTeamStats };
