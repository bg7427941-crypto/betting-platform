-- =========================================================
-- Equipos con estadísticas editables, usadas para calcular
-- cuotas automáticamente cuando dos equipos se enfrentan.
--
-- Dos modelos según el deporte (ver src/modules/teams/odds-engine.js):
--   - Fútbol: fuerza de ataque/defensa relativas al promedio de liga
--     (Maher 1982 + corrección de Dixon & Coles 1997 para el empate).
--   - Otros deportes (sin empate): rating Elo genérico.
-- =========================================================

CREATE TABLE IF NOT EXISTS teams (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL,
    sport           VARCHAR(50) NOT NULL,

    -- Modelo Maher/Dixon-Coles (solo relevante para deportes de gol bajo, ej. fútbol)
    -- Escala: 1.000 = promedio de la liga. >1 ataca/defiende peor que el promedio
    -- según el campo; <1 lo contrario (para defense_rating, MÁS ALTO = defensa MÁS
    -- débil, ya que multiplica los goles esperados del rival).
    attack_rating   NUMERIC(6,3) NOT NULL DEFAULT 1.000 CHECK (attack_rating > 0),
    defense_rating  NUMERIC(6,3) NOT NULL DEFAULT 1.000 CHECK (defense_rating > 0),

    -- Modelo Elo genérico (deportes sin empate: básquet, tenis, vóley)
    elo_rating      NUMERIC(7,2) NOT NULL DEFAULT 1500.00,

    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (name, sport)
);
CREATE INDEX IF NOT EXISTS idx_teams_sport ON teams(sport);

-- Vínculo opcional de cada evento a sus equipos registrados (para poder leer
-- sus estadísticas). Se mantienen home_team/away_team como texto porque son
-- el nombre "congelado" que se mostró en el evento, y para no romper eventos
-- viejos creados antes de que existiera esta tabla.
ALTER TABLE sport_events
  ADD COLUMN IF NOT EXISTS home_team_id UUID REFERENCES teams(id),
  ADD COLUMN IF NOT EXISTS away_team_id UUID REFERENCES teams(id);
