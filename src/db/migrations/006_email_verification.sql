-- =========================================================
-- Verificación de correo al registrarse.
--
-- OJO: migrate.js vuelve a correr TODAS las migraciones cada vez, así que
-- esto tiene que ser idempotente. El backfill (marcar como verificados a los
-- usuarios que ya existían, para no dejarlos afuera) corre UNA sola vez: solo
-- cuando la columna todavía no existe.
-- =========================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'email_verified_at'
  ) THEN
    ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMPTZ;
    UPDATE users SET email_verified_at = now();
  END IF;
END $$;

-- Guardamos solo el hash SHA-256 del token: si se filtra la base de datos,
-- los links de verificación pendientes no sirven.
CREATE TABLE IF NOT EXISTS email_verification_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(64) NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_verification_user ON email_verification_tokens(user_id);
