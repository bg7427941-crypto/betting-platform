/**
 * Motor de cálculo de cuotas a partir de estadísticas de equipos.
 *
 * Dos modelos, elegidos según el deporte:
 *
 * 1) FÚTBOL (y cualquier deporte de "gol bajo" con empate posible):
 *    Modelo de Maher (1982) con la corrección de Dixon & Coles (1997)
 *    ["Modelling Association Football Scores and Inefficiencies in the
 *    Football Betting Market", Applied Statistics 46(2)].
 *
 *    - Cada equipo tiene una fuerza de ataque (α) y de defensa (β),
 *      relativas al promedio de la liga (1.0 = promedio).
 *    - Goles esperados (Poisson):
 *        λ_local = promedioLiga · ataqueLocal · defensaVisita · ventajaLocal
 *        μ_visita = promedioLiga · ataqueVisita · defensaLocal
 *    - Dixon-Coles corrige los 4 marcadores bajos (0-0, 1-0, 0-1, 1-1) con
 *      un factor τ_ρ, porque el Poisson independiente subestima los
 *      empates de gol bajo. Usamos ρ = -0.13, el valor original fitteado
 *      por Dixon & Coles sobre la liga inglesa (sigue siendo el default
 *      más citado cuando no se tienen datos propios para reestimarlo).
 *
 * 2) DEPORTES SIN EMPATE (básquet, tenis, vóley, etc.):
 *    Rating Elo genérico (Elo, 1978; formalización estándar usada por
 *    FiveThirtyEight y otros). El marcador de puntos en estos deportes es
 *    demasiado alto/variable para modelarlo como conteo Poisson de "goles
 *    raros", así que se usa directamente la probabilidad logística Elo:
 *        P(local) = 1 / (1 + 10^(-((EloLocal + ventaja) - EloVisita) / 400))
 *
 * Conversión de probabilidad a cuota decimal ("overround" multiplicativo,
 * el método estándar de la industria): dado un margen de casa m,
 *        cuota_i = 1 / (p_i · (1 + m))
 * de forma que Σ(1/cuota_i) = 1 + m = overround total del mercado.
 */

const DIXON_COLES_RHO = -0.13;
const MAX_GOALS_GRID = 10; // suficiente: P(>10 goles de un lado) es despreciable
const DEFAULT_LEAGUE_AVG_GOALS = 1.4; // goles/equipo/partido, valor típico de referencia
const DEFAULT_HOME_ADVANTAGE_GOALS = 1.3; // multiplicador típico 1.25-1.4 en ligas europeas
const DEFAULT_HOME_ADVANTAGE_ELO = 60; // puntos Elo, bonus de local típico

const MIN_ODDS_PRICE = 1.01;
const MAX_ODDS_PRICE = 1000;
const DEFAULT_MARGIN_RATE = 0.06; // 6% de overround, similar a una casa retail

function factorial(n) {
  let result = 1;
  for (let i = 2; i <= n; i += 1) result *= i;
  return result;
}

function poissonPmf(k, lambda) {
  return (Math.exp(-lambda) * lambda ** k) / factorial(k);
}

/** Corrección de Dixon & Coles (1997), ecuación (3) del paper original. */
function dixonColesTau(x, y, lambda, mu, rho) {
  if (x === 0 && y === 0) return 1 - lambda * mu * rho;
  if (x === 0 && y === 1) return 1 + lambda * rho;
  if (x === 1 && y === 0) return 1 + mu * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

/**
 * Probabilidades de resultado (local/empate/visita) para un partido de
 * fútbol, dadas las fuerzas de ataque/defensa de ambos equipos.
 */
function footballMatchProbabilities({
  homeAttack,
  homeDefense,
  awayAttack,
  awayDefense,
  leagueAvgGoals = DEFAULT_LEAGUE_AVG_GOALS,
  homeAdvantage = DEFAULT_HOME_ADVANTAGE_GOALS,
  rho = DIXON_COLES_RHO,
  maxGoals = MAX_GOALS_GRID,
}) {
  const lambda = leagueAvgGoals * homeAttack * awayDefense * homeAdvantage;
  const mu = leagueAvgGoals * awayAttack * homeDefense;

  let pHome = 0;
  let pDraw = 0;
  let pAway = 0;

  for (let x = 0; x <= maxGoals; x += 1) {
    for (let y = 0; y <= maxGoals; y += 1) {
      const p = dixonColesTau(x, y, lambda, mu, rho) * poissonPmf(x, lambda) * poissonPmf(y, mu);
      if (x > y) pHome += p;
      else if (x === y) pDraw += p;
      else pAway += p;
    }
  }

  // La grilla trunca la cola (>maxGoals), así que renormalizamos para que
  // sume exactamente 1 — el error introducido es ínfimo con maxGoals=10.
  const total = pHome + pDraw + pAway;
  return {
    pHome: pHome / total,
    pDraw: pDraw / total,
    pAway: pAway / total,
    expectedGoalsHome: lambda,
    expectedGoalsAway: mu,
  };
}

/** Probabilidad de victoria vía rating Elo, para deportes sin empate. */
function eloMatchProbabilities({ homeElo, awayElo, homeAdvantage = DEFAULT_HOME_ADVANTAGE_ELO }) {
  const pHome = 1 / (1 + 10 ** (-((homeElo + homeAdvantage) - awayElo) / 400));
  return { pHome, pAway: 1 - pHome };
}

/**
 * Convierte un mapa de probabilidades { selection: p } a cuotas decimales,
 * aplicando el margen de casa (overround multiplicativo) y recortando al
 * rango operativo [MIN_ODDS_PRICE, MAX_ODDS_PRICE].
 */
function probabilitiesToOdds(probabilities, marginRate = DEFAULT_MARGIN_RATE) {
  const odds = {};
  for (const [selection, p] of Object.entries(probabilities)) {
    if (!(p > 0)) {
      odds[selection] = null;
      continue;
    }
    const raw = 1 / (p * (1 + marginRate));
    const clamped = Math.min(Math.max(raw, MIN_ODDS_PRICE), MAX_ODDS_PRICE);
    odds[selection] = Math.round(clamped * 100) / 100;
  }
  return odds;
}

/**
 * Calcula las cuotas 1x2 (o local/visita, sin empate) para un enfrentamiento,
 * eligiendo el modelo según el deporte. Es la función que usa el servicio
 * que orquesta la lectura/escritura en base de datos.
 */
function calculateMatchOdds({ sport, homeTeam, awayTeam, marginRate = DEFAULT_MARGIN_RATE }) {
  const hasDraw = sport === 'futbol'; // fútbol es el único deporte del catálogo con empate

  if (hasDraw) {
    const probs = footballMatchProbabilities({
      homeAttack: Number(homeTeam.attack_rating),
      homeDefense: Number(homeTeam.defense_rating),
      awayAttack: Number(awayTeam.attack_rating),
      awayDefense: Number(awayTeam.defense_rating),
    });
    const odds = probabilitiesToOdds(
      { home: probs.pHome, draw: probs.pDraw, away: probs.pAway },
      marginRate
    );
    return {
      model: 'dixon_coles',
      probabilities: { home: probs.pHome, draw: probs.pDraw, away: probs.pAway },
      expected_goals: { home: probs.expectedGoalsHome, away: probs.expectedGoalsAway },
      odds,
    };
  }

  const probs = eloMatchProbabilities({
    homeElo: Number(homeTeam.elo_rating),
    awayElo: Number(awayTeam.elo_rating),
  });
  const odds = probabilitiesToOdds({ home: probs.pHome, away: probs.pAway }, marginRate);
  return {
    model: 'elo',
    probabilities: { home: probs.pHome, away: probs.pAway },
    odds,
  };
}

module.exports = {
  poissonPmf,
  dixonColesTau,
  footballMatchProbabilities,
  eloMatchProbabilities,
  probabilitiesToOdds,
  calculateMatchOdds,
  DIXON_COLES_RHO,
  DEFAULT_MARGIN_RATE,
  MIN_ODDS_PRICE,
  MAX_ODDS_PRICE,
};
