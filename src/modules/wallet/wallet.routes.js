const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const walletService = require('./wallet.service');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const wallet = await walletService.getWallet(req.userId);
    res.json(wallet);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/deposit', async (req, res) => {
  try {
    const { amount_cents } = req.body;
    const result = await walletService.deposit(req.userId, amount_cents);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post('/withdraw', async (req, res) => {
  try {
    const { amount_cents } = req.body;
    const result = await walletService.withdraw(req.userId, amount_cents);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get('/history', async (req, res) => {
  try {
    const history = await walletService.getHistory(req.userId, {
      limit: Number(req.query.limit) || 50,
      offset: Number(req.query.offset) || 0,
    });
    res.json(history);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
