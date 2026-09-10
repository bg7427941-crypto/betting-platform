const rateLimit = require('express-rate-limit');

/**
 * Límite estricto para login: protege contra fuerza bruta de contraseñas.
 * Cuenta por IP. No cuenta los intentos exitosos, solo los fallidos/todos
 * (por defecto cuenta todos, que es lo más seguro contra brute force).
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de inicio de sesión. Intenta de nuevo más tarde.' },
});

/**
 * Límite más permisivo para registro: evita creación masiva de cuentas
 * automatizada sin molestar a usuarios legítimos.
 */
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados registros desde esta IP. Intenta de nuevo más tarde.' },
});

/**
 * Límite para rondas de casino: evita spam de requests para "fuerza bruta"
 * de resultados o sobrecarga del servidor con giros automatizados.
 * Cuenta por IP (podría combinarse con userId si se quiere ser más fino).
 */
const casinoPlayLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Estás jugando demasiado rápido. Espera un momento e intenta de nuevo.' },
});

module.exports = { loginLimiter, registerLimiter, casinoPlayLimiter };
