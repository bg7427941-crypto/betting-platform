const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const { query } = require('../db');
const { LiveBlackjackTable } = require('./liveBlackjackTable');

// Varias mesas, cada una con su propio shoe compartido y su propia mecánica
// (la mesa VIP tiene apuesta mínima más alta y menos asientos — dos
// "vibes" de mesa distintas, no clones).
const TABLE_CONFIGS = [
  { id: 'mesa-1', name: 'Mesa 1', maxSeats: 5, minBetCents: 100, maxBetCents: 20000 },
  { id: 'mesa-2', name: 'Mesa 2', maxSeats: 5, minBetCents: 100, maxBetCents: 20000 },
  { id: 'mesa-vip', name: 'Mesa VIP', maxSeats: 3, minBetCents: 2000, maxBetCents: 100000 },
];

function attachLiveBlackjack(httpServer, { allowedOrigin } = {}) {
  const io = new Server(httpServer, {
    path: '/socket.io/live-blackjack',
    cors: { origin: allowedOrigin || '*' },
  });

  const tables = new Map();
  for (const cfg of TABLE_CONFIGS) {
    tables.set(cfg.id, new LiveBlackjackTable({ ...cfg, emit: (event, payload) => io.to(cfg.id).emit(event, payload) }));
  }

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (!token) return next(new Error('unauthorized'));
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const result = await query('SELECT full_name FROM users WHERE id = $1 AND is_active = true', [payload.sub]);
      if (!result.rows[0]) return next(new Error('unauthorized'));
      socket.userId = payload.sub;
      socket.userName = result.rows[0].full_name.split(' ')[0];
      next();
    } catch (err) {
      next(new Error('unauthorized'));
    }
  });

  // Un mismo usuario puede estar conectado desde varios dispositivos a la vez.
  // La mesa maneja los asientos por userId, así que antes, cuando UNO de los
  // dispositivos se desconectaba (pestaña cerrada, celular que pierde señal),
  // el usuario perdía su asiento también en el otro. Ahora solo se lo saca de
  // la mesa cuando se va su ÚLTIMA conexión a esa mesa.
  function userHasOtherSocketAtTable(userId, tableId, exceptSocketId) {
    const room = io.sockets.adapter.rooms.get(tableId);
    if (!room) return false;
    for (const id of room) {
      if (id === exceptSocketId) continue;
      const other = io.sockets.sockets.get(id);
      if (other && other.userId === userId) return true;
    }
    return false;
  }

  io.on('connection', (socket) => {
    socket.emit(
      'tables:list',
      TABLE_CONFIGS.map(({ id, name, maxSeats, minBetCents, maxBetCents }) => ({ id, name, maxSeats, minBetCents, maxBetCents }))
    );

    let currentTableId = null;

    function currentTable() {
      return currentTableId ? tables.get(currentTableId) : null;
    }

    socket.on('table:join', ({ tableId, seat } = {}) => {
      const table = tables.get(tableId);
      if (!table) return socket.emit('table:error', 'Esa mesa no existe');

      if (currentTableId && currentTableId !== tableId) {
        tables.get(currentTableId).leave(socket.userId);
        socket.leave(currentTableId);
      }
      currentTableId = tableId;
      socket.join(tableId);

      try {
        if (seat) table.takeSeat(socket.userId, socket.userName);
        else table.spectate(socket.userId);
      } catch (err) {
        socket.emit('table:error', err.message);
      }
      socket.emit('table:state', table.getPublicState());
    });

    socket.on('table:leave', () => {
      currentTable()?.leave(socket.userId);
      if (currentTableId) socket.leave(currentTableId);
      currentTableId = null;
    });

    socket.on('table:bet', async ({ amountCents } = {}) => {
      try {
        await currentTable()?.placeBet(socket.userId, amountCents);
      } catch (err) {
        socket.emit('table:error', err.message);
      }
    });

    socket.on('table:hit', () => {
      try {
        currentTable()?.hit(socket.userId);
      } catch (err) {
        socket.emit('table:error', err.message);
      }
    });

    socket.on('table:stand', () => {
      try {
        currentTable()?.stand(socket.userId);
      } catch (err) {
        socket.emit('table:error', err.message);
      }
    });

    socket.on('table:double', async () => {
      try {
        await currentTable()?.double(socket.userId);
      } catch (err) {
        socket.emit('table:error', err.message);
      }
    });

    socket.on('disconnect', () => {
      if (currentTableId && userHasOtherSocketAtTable(socket.userId, currentTableId, socket.id)) return;
      currentTable()?.disconnectUser(socket.userId);
    });
  });

  return io;
}

module.exports = { attachLiveBlackjack };
