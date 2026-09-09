-- =========================================================
-- Migración inicial: esquema base de la plataforma de apuestas
-- Modo demo: saldo virtual, sin dinero real todavía
-- =========================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------- Usuarios ----------
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    full_name       VARCHAR(255) NOT NULL,
    birth_date      DATE NOT NULL,
    kyc_status      VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | verified | rejected
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_users_adult CHECK (birth_date <= (CURRENT_DATE - INTERVAL '18 years'))
);

-- ---------- Billeteras (saldo virtual) ----------
CREATE TABLE IF NOT EXISTS wallets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    balance_cents   BIGINT NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
    currency        VARCHAR(3) NOT NULL DEFAULT 'PEN',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, currency)
);

-- ---------- Transacciones de billetera ----------
CREATE TABLE IF NOT EXISTS transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id       UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    type            VARCHAR(20) NOT NULL, -- deposit | withdraw | bet_stake | bet_payout | adjustment
    amount_cents    BIGINT NOT NULL, -- positivo = entra, negativo = sale
    balance_after   BIGINT NOT NULL,
    reference_type  VARCHAR(20),        -- 'bet' | 'casino_round' | NULL
    reference_id    UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_transactions_wallet ON transactions(wallet_id);

-- ---------- Eventos deportivos ----------
CREATE TABLE IF NOT EXISTS sport_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sport           VARCHAR(50) NOT NULL,       -- futbol, basket, tenis...
    home_team       VARCHAR(100) NOT NULL,
    away_team       VARCHAR(100) NOT NULL,
    starts_at       TIMESTAMPTZ NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'scheduled', -- scheduled | live | finished | cancelled
    result          VARCHAR(20),                -- home | away | draw (cuando finaliza)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Cuotas (odds) ----------
CREATE TABLE IF NOT EXISTS odds (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id        UUID NOT NULL REFERENCES sport_events(id) ON DELETE CASCADE,
    market          VARCHAR(30) NOT NULL,   -- '1x2', 'over_under_2_5', etc.
    selection       VARCHAR(30) NOT NULL,   -- 'home', 'draw', 'away', 'over', 'under'
    price           NUMERIC(6,2) NOT NULL,  -- cuota decimal, ej. 2.35
    is_active       BOOLEAN NOT NULL DEFAULT true,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_odds_event ON odds(event_id);

-- ---------- Apuestas deportivas ----------
CREATE TABLE IF NOT EXISTS bets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_id        UUID NOT NULL REFERENCES sport_events(id),
    odds_id         UUID NOT NULL REFERENCES odds(id),
    stake_cents     BIGINT NOT NULL CHECK (stake_cents > 0),
    price_taken     NUMERIC(6,2) NOT NULL, -- cuota congelada al momento de apostar
    status          VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | won | lost | void
    payout_cents    BIGINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    settled_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_bets_user ON bets(user_id);
CREATE INDEX IF NOT EXISTS idx_bets_event ON bets(event_id);

-- ---------- Rondas de casino (slots, ruleta, etc.) ----------
CREATE TABLE IF NOT EXISTS casino_rounds (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game            VARCHAR(30) NOT NULL, -- 'roulette', 'slots'
    stake_cents     BIGINT NOT NULL CHECK (stake_cents > 0),
    outcome         JSONB NOT NULL,       -- detalle del resultado (números, símbolos, etc.)
    payout_cents    BIGINT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_casino_rounds_user ON casino_rounds(user_id);
