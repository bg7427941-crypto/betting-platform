const express = require('express');
const cors = require('cors');

const authRoutes = require('./modules/auth/auth.routes');
const walletRoutes = require('./modules/wallet/wallet.routes');
const sportsRoutes = require('./modules/sports/sports.routes');
const casinoRoutes = require('./modules/casino/casino.routes');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/sports', sportsRoutes);
app.use('/api/casino', casinoRoutes);

// Manejo de errores no capturados
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

module.exports = app;
