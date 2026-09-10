const express = require('express');
const { requireAuth, requireAdmin } = require('../../middleware/auth');
const adminService = require('./admin.service');

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get('/summary', async (req, res) => {
  try {
    const summary = await adminService.getDashboardSummary();
    res.json(summary);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
