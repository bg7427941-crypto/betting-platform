const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const authRoutes = require('./modules/auth/auth.routes');
const walletRoutes = require('./modules/wallet/wallet.routes');
const sportsRoutes = require('./modules/sports/sports.routes');
const casinoRoutes = require('./modules/casino/casino.routes');
const adminRoutes = require('./modules/admin/admin.routes');
const teamsRoutes = require('./modules/teams/teams.routes');

const app = express();

// Detrás de un proxy/balanceador (Render, Railway, Heroku, etc.) hace falta
// esto para que express-rate-limit lea la IP real del cliente (X-Forwarded-For)
// en vez de contar todas las requests como si vinieran del proxy.
app.set('trust proxy', 1);

app.use(helmet());

// En producción, restringido al origen del frontend (ver .env.example).
// Sin ALLOWED_ORIGIN seteado, cae a permitir cualquier origen — cómodo para
// desarrollo local, pero hay que setearlo antes de deployar.
const allowedOrigin = process.env.ALLOWED_ORIGIN;
app.use(cors(allowedOrigin ? { origin: allowedOrigin } : undefined));

app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', authRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/sports', sportsRoutes);
app.use('/api/casino', casinoRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin/teams', teamsRoutes);

// Manejo de errores no capturados
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

module.exports = app;
