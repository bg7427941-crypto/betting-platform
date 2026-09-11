const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const { casinoPlayLimiter } = require('../../middleware/rateLimit');
const { query } = require('../../db');
const casinoService = require('./casino.service');

const router = express.Router();
router.use(requireAuth);

router.post('/play', casinoPlayLimiter, async (req, res) => {
  try {
    const { game, stake_cents, bets, buy_bonus, ante_tier } = req.body;
    const normalizedBets = Array.isArray(bets)
      ? bets.map((b) => ({ type: b.type, value: b.value, stakeCents: b.stake_cents }))
      : undefined;
    const result = await casinoService.playRound(req.userId, {
      game,
      stakeCents: stake_cents,
      bets: normalizedBets,
      buyBonus: buy_bonus,
      anteTier: ante_tier,
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/slots/config', (req, res) => {
  res.json(casinoService.getSlotsConfig());
});

router.get('/history', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const offset = Number(req.query.offset) || 0;
    const result = await query(
      `SELECT id, game, stake_cents, outcome, payout_cents, created_at
       FROM casino_rounds
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.userId, limit, offset]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;