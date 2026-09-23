-- =========================================================
-- Límite de depósito diario (autoimpuesto por el usuario) y retención
-- de aumentos con demora de 24h — mismo patrón que usan las plataformas
-- reales de apuestas reguladas: BAJAR el límite (o ponerlo por primera
-- vez) es inmediato, SUBIRLO o quitarlo tarda 24h en aplicarse. La idea
-- es que un impulso de "quiero depositar más" a mitad de una mala racha
-- no pueda saltarse el límite que la persona se puso en frío.
-- =========================================================

ALTER TABLE wallets
  ADD COLUMN IF NOT EXISTS daily_deposit_limit_cents BIGINT
    CHECK (daily_deposit_limit_cents IS NULL OR daily_deposit_limit_cents > 0),
  ADD COLUMN IF NOT EXISTS pending_deposit_limit_cents BIGINT
    CHECK (pending_deposit_limit_cents IS NULL OR pending_deposit_limit_cents > 0),
  ADD COLUMN IF NOT EXISTS pending_deposit_limit_effective_at TIMESTAMPTZ;
