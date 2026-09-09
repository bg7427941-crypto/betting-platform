-- =========================================================
-- Agrega rol de usuario (user | admin) para proteger rutas admin
-- =========================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user'
  CHECK (role IN ('user', 'admin'));
