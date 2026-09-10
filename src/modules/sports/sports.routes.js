const express = require('express');
const { requireAuth, requireAdmin } = require('../../middleware/auth');
const eventsService = require('./events.service');
const settlementService = require('./settlement.service');
const betsService = require('../bets/bets.service');

const router = express.Router();

// ---------- Público (requiere estar logueado para ver, ajusta si quieres abierto) ----------
router.get('/events', requireAuth, async (req, res) => {
  try {
    const events = await eventsService.listUpcomingEvents();
    res.json(events);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/events/:id', requireAuth, async (req, res) => {
  try {
    const event = await eventsService.getEventWithOdds(req.params.id);
    res.json(event);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/bets', requireAuth, async (req, res) => {
  try {
    const { eventId, oddsId, stake_cents } = req.body;
    const result = await betsService.placeBet(req.userId, {
      eventId,
      oddsId,
      stakeCents: stake_cents,
    });
    res.status(201).json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ---------- Admin (protegidas con requireAdmin) ----------
router.post('/admin/events', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { sport, homeTeam, awayTeam, startsAt } = req.body;
    const event = await eventsService.createEvent({ sport, homeTeam, awayTeam, startsAt });
    res.status(201).json(event);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/admin/events/:id/odds', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { market, selection, price } = req.body;
    const odds = await eventsService.setOdds(req.params.id, market, selection, price);
    res.status(201).json(odds);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/admin/events/:id/finish', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { result } = req.body; // 'home' | 'away' | 'draw'
    const settlement = await settlementService.finishAndSettleEvent(req.params.id, result);
    res.json(settlement);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
