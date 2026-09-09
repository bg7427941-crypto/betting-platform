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

/** Columna real de la mesa (1, 2 o 3) para números 1-36. El 0 no pertenece a ninguna. */
function columnOf(number) {
  if (number === 0) return null;
  return ((number - 1) % 3) + 1;
}

/** Docena real de la mesa (1: 1-12, 2: 13-24, 3: 25-36). El 0 no pertenece a ninguna. */
function dozenOf(number) {
  if (number === 0) return null;
  return Math.ceil(number / 12);
}

/** Gira la rueda una sola vez. Puramente RNG, sin conocer las apuestas. */
function spinRouletteWheel() {
  const winningNumber = crypto.randomInt(0, 37); // 0..36 inclusive
  return { winningNumber, color: colorOf(winningNumber) };
}

/**
 * Resuelve UNA apuesta contra un número ya sorteado.
 * bet: { type, value? }
 *   - 'straight'  value: 0-36               paga 35:1 (mult 36)
 *   - 'red' | 'black'                        paga 1:1  (mult 2)
 *   - 'even' | 'odd'                         paga 1:1  (mult 2)
 *   - 'low' (1-18) | 'high' (19-36)          paga 1:1  (mult 2)
 *   - 'dozen'     value: 1|2|3               paga 2:1  (mult 3)
 *   - 'column'    value: 1|2|3               paga 2:1  (mult 3)
 * Devuelve { won, multiplier }.
 */
function resolveRouletteBet(bet, winningNumber, color) {
  switch (bet.type) {
    case 'straight': {
      const won = bet.value === winningNumber;
      return { won, multiplier: won ? 36 : 0 };
    }
    case 'red':
    case 'black': {
      const won = color === bet.type;
      return { won, multiplier: won ? 2 : 0 };
    }
    case 'even': {
      const won = winningNumber !== 0 && winningNumber % 2 === 0;
      return { won, multiplier: won ? 2 : 0 };
    }
    case 'odd': {
      const won = winningNumber % 2 === 1;
      return { won, multiplier: won ? 2 : 0 };
    }
    case 'low': {
      const won = winningNumber >= 1 && winningNumber <= 18;
      return { won, multiplier: won ? 2 : 0 };
    }
    case 'high': {
      const won = winningNumber >= 19 && winningNumber <= 36;
      return { won, multiplier: won ? 2 : 0 };
    }
    case 'dozen': {
      const won = dozenOf(winningNumber) === bet.value;
      return { won, multiplier: won ? 3 : 0 };
    }
    case 'column': {
      const won = columnOf(winningNumber) === bet.value;
      return { won, multiplier: won ? 3 : 0 };
    }
    default:
      throw Object.assign(new Error(`Tipo de apuesta de ruleta inválido: ${bet.type}`), { status: 400 });
  }
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

module.exports = { spinRouletteWheel, resolveRouletteBet, playSlots, colorOf, columnOf, dozenOf };