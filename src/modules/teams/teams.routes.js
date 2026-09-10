const express = require('express');
const { requireAuth, requireAdmin } = require('../../middleware/auth');
const teamsService = require('./teams.service');

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get('/', async (req, res) => {
  try {
    const teams = await teamsService.listTeams(req.query.sport);
    res.json(teams);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, sport, attackRating, defenseRating, eloRating, notes } = req.body;
    const team = await teamsService.createTeam({ name, sport, attackRating, defenseRating, eloRating, notes });
    res.status(201).json(team);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un equipo con ese nombre en ese deporte' });
    }
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const { attackRating, defenseRating, eloRating, notes } = req.body;
    const team = await teamsService.updateTeamStats(req.params.id, {
      attackRating,
      defenseRating,
      eloRating,
      notes,
    });
    res.json(team);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
