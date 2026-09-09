const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query, withTransaction } = require('../../db');

const SALT_ROUNDS = 12;
const MIN_AGE_YEARS = Number(process.env.MIN_AGE_YEARS || 18);

function isOldEnough(birthDateStr) {
  const birthDate = new Date(birthDateStr);
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - MIN_AGE_YEARS);
  return birthDate <= cutoff;
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role || 'user' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

async function register({ email, password, fullName, birthDate }) {
  if (!email || !password || !fullName || !birthDate) {
    throw Object.assign(new Error('Faltan campos obligatorios'), { status: 400 });
  }

  if (!isOldEnough(birthDate)) {
    throw Object.assign(
      new Error(`Debes tener al menos ${MIN_AGE_YEARS} años para registrarte`),
      { status: 403 }
    );
  }

  const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    throw Object.assign(new Error('El email ya está registrado'), { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  // Crear usuario + wallet inicial en una sola transacción
  const user = await withTransaction(async (client) => {
    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, full_name, birth_date)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, full_name, birth_date, role, created_at`,
      [email, passwordHash, fullName, birthDate]
    );
    const newUser = userResult.rows[0];

    await client.query(
      `INSERT INTO wallets (user_id, balance_cents, currency)
       VALUES ($1, 0, 'PEN')`,
      [newUser.id]
    );

    return newUser;
  });

  const token = signToken(user);
  return { user, token };
}

async function login({ email, password }) {
  const result = await query(
    'SELECT id, email, password_hash, full_name, role, is_active FROM users WHERE email = $1',
    [email]
  );
  const user = result.rows[0];

  if (!user || !user.is_active) {
    throw Object.assign(new Error('Credenciales inválidas'), { status: 401 });
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    throw Object.assign(new Error('Credenciales inválidas'), { status: 401 });
  }

  const token = signToken(user);
  delete user.password_hash;
  return { user, token };
}

module.exports = { register, login, isOldEnough };
