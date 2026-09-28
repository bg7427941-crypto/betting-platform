const rateLimit = require('express-rate-limit');

/**
 * Límite estricto para login: protege contra fuerza bruta de contraseñas.
 * Cuenta por IP, pero SOLO los intentos fallidos. Antes contaba también los
 * exitosos: dos dispositivos en la misma red (mismo WiFi = misma IP pública)
 * compartían el contador y, entre logins, reintentos y refrescos, se quedaban
 * sin intentos. Con esto el login exitoso no consume cupo.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  limit: 10,
  skipSuccessfulRequests: true,
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
 *
 * 100/min da margen para el modo turbo + autoplay del tragamonedas (un
 * giro turbo completo dura ~1s, ~55-60/min en uso normal); sigue
 * bloqueando scripts que disparen requests mucho más seguido que eso.
 */
const casinoPlayLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Estás jugando demasiado rápido. Espera un momento e intenta de nuevo.' },
});

module.exports = { loginLimiter, registerLimiter, casinoPlayLimiter };
