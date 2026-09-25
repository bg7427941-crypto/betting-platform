require('dotenv').config();
const http = require('http');
const app = require('./app');
const { attachLiveBlackjack } = require('./realtime/liveBlackjack');

const PORT = process.env.PORT || 4000;

const server = http.createServer(app);
attachLiveBlackjack(server, { allowedOrigin: process.env.ALLOWED_ORIGIN });

server.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
