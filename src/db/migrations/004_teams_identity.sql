-- =========================================================
-- Campos de identidad del equipo, además de sus stats.
-- Antes un equipo era solo un nombre + dos números (ataque/defensa
-- o elo) — country/league dan contexto, y color se usa para armar
-- un "escudo" simple (círculo con las iniciales) en vez de nada.
-- =========================================================

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS country VARCHAR(100),
  ADD COLUMN IF NOT EXISTS league VARCHAR(100),
  -- Hex de 6 dígitos, ej. #1F6F4C. Si no se especifica, el frontend deriva
  -- un color determinístico a partir del nombre (mismo equipo = mismo color
  -- siempre, sin necesidad de guardar nada).
  ADD COLUMN IF NOT EXISTS color VARCHAR(7) CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$');
