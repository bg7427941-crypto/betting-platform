const crypto = require('crypto');

// =========================================================
// RULETA (europea, 0-36, un solo cero)
// =========================================================

const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

function colorOf(number) {
  if (number === 0) return 'green';
  return RED_NUMBERS.has(number) ? 'red' : 'black';
}

/**
 * bet: { type: 'straight' | 'red' | 'black' | 'even' | 'odd' | 'low' | 'high', value?: number }
 * Devuelve { winningNumber, color, won, multiplier }
 */
function playRoulette(bet) {
  const winningNumber = crypto.randomInt(0, 37); // 0..36 inclusive
  const color = colorOf(winningNumber);

  let won = false;
  let multiplier = 0;

  switch (bet.type) {
    case 'straight': // apuesta a un número exacto, paga 35:1
      won = bet.value === winningNumber;
      multiplier = won ? 36 : 0; // incluye el stake devuelto
      break;
    case 'red':
    case 'black':
      won = color === bet.type;
      multiplier = won ? 2 : 0;
      break;
    case 'even':
      won = winningNumber !== 0 && winningNumber % 2 === 0;
      multiplier = won ? 2 : 0;
      break;
    case 'odd':
      won = winningNumber % 2 === 1;
      multiplier = won ? 2 : 0;
      break;
    case 'low': // 1-18
      won = winningNumber >= 1 && winningNumber <= 18;
      multiplier = won ? 2 : 0;
      break;
    case 'high': // 19-36
      won = winningNumber >= 19 && winningNumber <= 36;
      multiplier = won ? 2 : 0;
      break;
    default:
      throw Object.assign(new Error('Tipo de apuesta de ruleta inválido'), { status: 400 });
  }

  return { winningNumber, color, won, multiplier };
}

// =========================================================
// SLOTS (tragamonedas simple, 3 rodillos, 5 símbolos)
// =========================================================

// Pesos relativos: los símbolos de mayor pago aparecen con menor frecuencia.
const SYMBOLS = [
  { symbol: '🍒', weight: 40, payout3: 2 },
  { symbol: '🍋', weight: 30, payout3: 3 },
  { symbol: '🔔', weight: 15, payout3: 8 },
  { symbol: '⭐', weight: 10, payout3: 15 },
  { symbol: '7️⃣', weight: 5, payout3: 50 },
];

const TOTAL_WEIGHT = SYMBOLS.reduce((sum, s) => sum + s.weight, 0);

function spinReel() {
  let roll = crypto.randomInt(0, TOTAL_WEIGHT);
  for (const s of SYMBOLS) {
    if (roll < s.weight) return s;
    roll -= s.weight;
  }
  return SYMBOLS[0]; // fallback, no debería alcanzarse
}

/**
 * Devuelve { reels: [symbol, symbol, symbol], won, multiplier }
 */
function playSlots() {
  const reels = [spinReel(), spinReel(), spinReel()];
  const allEqual = reels[0].symbol === reels[1].symbol && reels[1].symbol === reels[2].symbol;

  const won = allEqual;
  const multiplier = allEqual ? reels[0].payout3 : 0;

  return {
    reels: reels.map((r) => r.symbol),
    won,
    multiplier,
  };
}

module.exports = { playRoulette, playSlots };
