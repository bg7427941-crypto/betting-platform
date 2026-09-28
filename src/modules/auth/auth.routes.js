const express = require('express');
const authService = require('./auth.service');
const { loginLimiter, registerLimiter, resendVerificationLimiter } = require('../../middleware/rateLimit');

const router = express.Router();

function sendError(res, err) {
  res.status(err.status || 500).json({
    error: err.message,
    ...(err.errorCode && { code: err.errorCode }),
  });
}

router.post('/register', registerLimiter, async (req, res) => {
  try {
    const result = await authService.register(req.body);
    res.status(201).json(result);
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { user, token } = await authService.login(req.body);
    res.json({ user, token });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/verify-email', async (req, res) => {
  try {
    await authService.verifyEmail(req.body && req.body.token);
    res.json({ verified: true });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/resend-verification', resendVerificationLimiter, async (req, res) => {
  try {
    await authService.resendVerification(req.body && req.body.email);
    res.json({ message: 'Si el correo está registrado y pendiente de verificar, te enviamos un nuevo enlace.' });
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
