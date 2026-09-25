import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

/** Una sola conexión socket para toda la sesión de "mesa en vivo". */
export function connectLiveBlackjack() {
  const token = localStorage.getItem('token');
  return io(API_URL, {
    path: '/socket.io/live-blackjack',
    auth: { token },
    autoConnect: true,
    transports: ['websocket', 'polling'],
  });
}
