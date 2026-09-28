const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { query, withTransaction } = require('../../db');
const { sendVerificationEmail } = require('../../services/mailer');

const SALT_ROUNDS = 12;
const MIN_AGE_YEARS = Number(process.env.MIN_AGE_YEARS || 18);
const MIN_PASSWORD_LENGTH = 8;
const VERIFICATION_TTL_HOURS = Number(process.env.EMAIL_VERIFICATION_TTL_HOURS || 24);
const RESEND_COOLDOWN_SECONDS = 60;

function isOldEnough(birthDateStr) {
  const birthDate = new Date(birthDateStr);
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - MIN_AGE_YEARS);
  return birthDate <= cutoff;
}

/** Los teclados de celular suelen poner la primera letra en mayúscula
 * ("Bruno@gmail.com"). Antes el correo se comparaba tal cual, así que la misma
 * cuenta funcionaba en la PC y fallaba con "Credenciales inválidas" en el
 * celular. Ahora siempre se compara en minúsculas y sin espacios. */
function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/** Antes solo se chequeaba que la contraseña no estuviera vacía — se podía
 * registrar una cuenta con "1". Exige largo mínimo + al menos una letra y
 * un número (sin pedir símbolos raros, que suelen hacer que la gente
 * termine anotando la contraseña en un post-it). */
function passwordErrors(password) {
  const errors = [];
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    errors.push(`al menos ${MIN_PASSWORD_LENGTH} caracteres`);
  }
  if (!/[A-Za-z]/.test(password || '')) {
    errors.push('al menos una letra');
  }
  if (!/[0-9]/.test(password || '')) {
    errors.push('al menos un número');
  }
  return errors;
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role || 'user' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Genera un token nuevo (invalida los anteriores del usuario) y devuelve el
 * valor en claro, que solo viaja por correo. En la base queda el hash. */
async function createVerificationToken(client, userId) {
  const raw = crypto.randomBytes(32).toString('hex');
  await client.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [userId]);
  await client.query(
    `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + ($3::int * interval '1 hour'))`,
    [userId, hashToken(raw), VERIFICATION_TTL_HOURS]
  );
  return raw;
}

async function register({ email, password, fullName, birthDate }) {
  email = normalizeEmail(email);

  if (!email || !password || !fullName || !birthDate) {
    throw Object.assign(new Error('Faltan campos obligatorios'), { status: 400 });
  }

  const pwErrors = passwordErrors(password);
  if (pwErrors.length > 0) {
    throw Object.assign(
      new Error(`La contraseña debe tener ${pwErrors.join(', ')}`),
      { status: 400 }
    );
  }

  if (!isOldEnough(birthDate)) {
    throw Object.assign(
      new Error(`Debes tener al menos ${MIN_AGE_YEARS} años para registrarte`),
      { status: 403 }
    );
  }

  const existing = await query('SELECT id FROM users WHERE lower(email) = $1', [email]);
  if (existing.rows.length > 0) {
    throw Object.assign(new Error('El email ya está registrado'), { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  // Crear usuario + wallet inicial + token de verificación en una sola transacción
  const { user, verificationToken } = await withTransaction(async (client) => {
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

    const token = await createVerificationToken(client, newUser.id);
    return { user: newUser, verificationToken: token };
  });

  // El correo se manda DESPUÉS del commit. Si falla el envío, la cuenta igual
  // existe y el usuario puede pedir que se lo reenvíen.
  let emailSent = true;
  let devLink;
  try {
    const result = await sendVerificationEmail({ to: user.email, fullName: user.full_name, token: verificationToken });
    emailSent = result.delivered;
    devLink = result.devLink;
  } catch (err) {
    console.error('No se pudo enviar el correo de verificación:', err.message);
    emailSent = false;
  }

  // Sin token de sesión: hasta verificar el correo no se puede iniciar sesión.
  return { user, requiresVerification: true, emailSent, ...(devLink && { devLink }) };
}

async function login({ email, password }) {
  const result = await query(
    `SELECT id, email, password_hash, full_name, role, is_active, email_verified_at
       FROM users WHERE lower(email) = $1`,
    [normalizeEmail(email)]
  );
  const user = result.rows[0];

  if (!user || !user.is_active) {
    throw Object.assign(new Error('Credenciales inválidas'), { status: 401 });
  }

  const match = await bcrypt.compare(password || '', user.password_hash);
  if (!match) {
    throw Object.assign(new Error('Credenciales inválidas'), { status: 401 });
  }

  // Se chequea DESPUÉS de validar la contraseña para no revelar a un tercero
  // qué correos existen y cuáles están pendientes de verificar.
  if (!user.email_verified_at) {
    throw Object.assign(
      new Error('Debes verificar tu correo antes de iniciar sesión. Revisa tu bandeja de entrada.'),
      { status: 403, errorCode: 'EMAIL_NOT_VERIFIED' }
    );
  }

  const token = signToken(user);
  delete user.password_hash;
  return { user, token };
}

async function verifyEmail(token) {
  if (!token || typeof token !== 'string') {
    throw Object.assign(new Error('Enlace de verificación inválido'), { status: 400 });
  }

  const found = await query(
    `SELECT user_id FROM email_verification_tokens WHERE token_hash = $1 AND expires_at > now()`,
    [hashToken(token)]
  );
  const row = found.rows[0];
  if (!row) {
    throw Object.assign(
      new Error('El enlace de verificación es inválido o ya venció. Pide uno nuevo.'),
      { status: 400, errorCode: 'INVALID_OR_EXPIRED_TOKEN' }
    );
  }

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()), updated_at = now() WHERE id = $1`,
      [row.user_id]
    );
    await client.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [row.user_id]);
  });
}

/** Siempre responde igual, exista o no el correo, para no revelar qué correos
 * están registrados. */
async function resendVerification(email) {
  const result = await query(
    `SELECT id, email, full_name, is_active, email_verified_at FROM users WHERE lower(email) = $1`,
    [normalizeEmail(email)]
  );
  const user = result.rows[0];
  if (!user || !user.is_active || user.email_verified_at) return;

  // Cooldown: si ya se mandó uno hace menos de un minuto, no mandamos otro.
  const recent = await query(
    `SELECT 1 FROM email_verification_tokens
      WHERE user_id = $1 AND created_at > now() - ($2::int * interval '1 second')`,
    [user.id, RESEND_COOLDOWN_SECONDS]
  );
  if (recent.rows.length > 0) return;

  const token = await withTransaction((client) => createVerificationToken(client, user.id));
  try {
    await sendVerificationEmail({ to: user.email, fullName: user.full_name, token });
  } catch (err) {
    console.error('No se pudo reenviar el correo de verificación:', err.message);
  }
}

module.exports = { register, login, verifyEmail, resendVerification, isOldEnough, normalizeEmail };
