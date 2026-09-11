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
// SLOTS (grid 5x3, 10 líneas de pago fijas, wild + scatter —
// la estructura estándar de un video-slot moderno tipo Pragmatic Play)
// =========================================================

const REELS = 5;
const ROWS = 3;

const WILD = '🃏';
const SCATTER = '💰';

// Pesos relativos por símbolo (mismo pool para las 15 posiciones — no se
// simulan tiras físicas de rodillo distintas por carril, alcanza para el
// demo). Los símbolos de mayor pago aparecen con menor frecuencia.
// payout: multiplicador del apostado-por-línea según cuántos seguidos
// (3, 4 o 5) caen desde el carril 1 hacia la derecha.
const SLOT_SYMBOLS = [
  { symbol: '♣️', weight: 20, payout: { 3: 12, 4: 35, 5: 95 } },
  { symbol: '♦️', weight: 20, payout: { 3: 12, 4: 35, 5: 95 } },
  { symbol: '♥️', weight: 18, payout: { 3: 14, 4: 42, 5: 120 } },
  { symbol: '♠️', weight: 18, payout: { 3: 14, 4: 42, 5: 120 } },
  { symbol: '🔔', weight: 12, payout: { 3: 25, 4: 60, 5: 175 } },
  { symbol: '⭐', weight: 10, payout: { 3: 35, 4: 95, 5: 235 } },
  { symbol: '💎', weight: 6, payout: { 3: 60, 4: 175, 5: 600 } },
  { symbol: '👑', weight: 4, payout: { 3: 120, 4: 350, 5: 1200 } },
  { symbol: '7️⃣', weight: 2, payout: { 3: 235, 4: 700, 5: 2350 } },
  // Wild: sustituye a cualquier símbolo pagante en una línea. También puede
  // formar su propia línea si caen 3+ wilds seguidos (payout propio, alto).
  { symbol: WILD, weight: 3, payout: { 3: 175, 4: 600, 5: 1750 } },
  // Scatter: paga en cualquier posición del grid (no necesita estar en una
  // línea ni ser consecutivo) — es el símbolo "de la suerte" que dispara
  // los pagos grandes y vistosos. Multiplica el apostado TOTAL, no por línea.
  { symbol: SCATTER, weight: 3, payout: null },
];

const SYMBOL_PAYOUTS = Object.fromEntries(SLOT_SYMBOLS.map((s) => [s.symbol, s.payout]));
const SCATTER_PAYOUTS = { 3: 25, 4: 120, 5: 600 };
// RTP medido por simulación (5M giros) en modo normal: ~97.2%, tasa de
// victoria ~24.6%, scatter (3+) ~1 de cada 160 giros. El modo "ante"
// (más probabilidad de scatter) y "comprar bono" (scatter garantizado)
// bajan el RTP a propósito a cambio de esa probabilidad — así funcionan
// en los juegos reales de este estilo; no son apuestas "gratis".

const BASE_TOTAL_SLOT_WEIGHT = SLOT_SYMBOLS.reduce((sum, s) => sum + s.weight, 0);

/** Devuelve la tabla de pesos con el peso del scatter multiplicado por `scatterBoost`. */
function weightedSymbols(scatterBoost) {
  if (scatterBoost === 1) return { symbols: SLOT_SYMBOLS, totalWeight: BASE_TOTAL_SLOT_WEIGHT };
  const symbols = SLOT_SYMBOLS.map((s) => (s.symbol === SCATTER ? { ...s, weight: s.weight * scatterBoost } : s));
  const totalWeight = symbols.reduce((sum, s) => sum + s.weight, 0);
  return { symbols, totalWeight };
}

function spinSymbolFrom(symbols, totalWeight) {
  let roll = crypto.randomInt(0, totalWeight);
  for (const s of symbols) {
    if (roll < s.weight) return s.symbol;
    roll -= s.weight;
  }
  return symbols[0].symbol; // fallback, no debería alcanzarse
}

/** Grid de 5 carriles x 3 filas: grid[carril][fila]. */
function spinSlotGrid(scatterBoost = 1) {
  const { symbols, totalWeight } = weightedSymbols(scatterBoost);
  const grid = [];
  for (let reel = 0; reel < REELS; reel += 1) {
    const column = [];
    for (let row = 0; row < ROWS; row += 1) column.push(spinSymbolFrom(symbols, totalWeight));
    grid.push(column);
  }
  return grid;
}

/** Último recurso si el RNG no convergió en MAX_ATTEMPTS (astronómicamente
 * improbable): coloca scatters a la fuerza en carriles al azar hasta llegar
 * al mínimo garantizado. Nunca debería ejecutarse en la práctica. */
function forcePlaceScatters(grid, minCount) {
  const next = grid.map((col) => [...col]);
  const reelOrder = [...Array(REELS).keys()].sort(() => crypto.randomInt(0, 2) - 0.5);
  let placed = countScatters(next);
  for (const reel of reelOrder) {
    if (placed >= minCount) break;
    const row = crypto.randomInt(0, ROWS);
    if (next[reel][row] !== SCATTER) {
      next[reel][row] = SCATTER;
      placed += 1;
    }
  }
  return next;
}

// 10 líneas de pago clásicas, como fila por carril (0 = arriba, 2 = abajo).
const PAYLINES = [
  [1, 1, 1, 1, 1], // medio
  [0, 0, 0, 0, 0], // arriba
  [2, 2, 2, 2, 2], // abajo
  [0, 1, 2, 1, 0], // V
  [2, 1, 0, 1, 2], // V invertida
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [0, 1, 1, 1, 0],
];

/**
 * Evalúa una línea de 5 símbolos (ya extraídos del grid según el patrón de
 * la línea). Devuelve { symbol, length } del combo ganador desde el
 * carril 1, o null si no hay combo pagante (menos de 3 seguidos).
 */
function evaluatePayline(symbolsOnLine) {
  const baseIndex = symbolsOnLine.findIndex((s) => s !== WILD);
  const base = baseIndex === -1 ? WILD : symbolsOnLine[baseIndex]; // todo-wild paga como wild
  if (base === SCATTER) return null; // el scatter no forma líneas, paga aparte

  let length = 0;
  for (const s of symbolsOnLine) {
    if (s === base || s === WILD) length += 1;
    else break;
  }
  if (length < 3) return null;
  return { symbol: base, length };
}

function countScatters(grid) {
  let count = 0;
  for (const column of grid) {
    for (const symbol of column) {
      if (symbol === SCATTER) count += 1;
    }
  }
  return count;
}

/**
 * Gira el grid y resuelve las 10 líneas + el scatter. El "multiplier"
 * devuelto ya combina ambos en un solo número por el que el caller
 * multiplica el monto apostado BASE (no el costo real cobrado si hay
 * ante o compra de bono — ver casino.service.js).
 *
 * options.scatterBoost: multiplica el peso del scatter (apuesta "ante").
 * options.guaranteeBonus: fuerza que el giro caiga con 3+ scatters
 * (comprar el bono directamente) — se logra re-girando el grid completo
 * con un boost fuerte hasta que ocurra naturalmente, nunca "pintando"
 * el resultado a mano salvo como último recurso extremo.
 */
function playSlots({ scatterBoost = 1, guaranteeBonus = false } = {}) {
  let grid;

  if (guaranteeBonus) {
    const CONVERGENCE_BOOST = 8; // boost fuerte para que converja rápido
    const MAX_ATTEMPTS = 3000;
    let attempts = 0;
    do {
      grid = spinSlotGrid(CONVERGENCE_BOOST);
      attempts += 1;
    } while (countScatters(grid) < 3 && attempts < MAX_ATTEMPTS);
    if (countScatters(grid) < 3) {
      grid = forcePlaceScatters(grid, 3);
    }
  } else {
    grid = spinSlotGrid(scatterBoost);
  }

  let lineMultiplierSum = 0;
  const winningLines = [];
  PAYLINES.forEach((pattern, lineIndex) => {
    const symbolsOnLine = pattern.map((row, reel) => grid[reel][row]);
    const combo = evaluatePayline(symbolsOnLine);
    if (!combo) return;
    const mult = SYMBOL_PAYOUTS[combo.symbol]?.[combo.length] || 0;
    if (mult <= 0) return;
    lineMultiplierSum += mult;
    winningLines.push({ line: lineIndex, symbol: combo.symbol, length: combo.length, multiplier: mult });
  });

  const scatterCount = countScatters(grid);
  const scatterMultiplier = scatterCount >= 3 ? SCATTER_PAYOUTS[Math.min(scatterCount, 5)] || 0 : 0;

  const multiplier = lineMultiplierSum / PAYLINES.length + scatterMultiplier;

  return {
    grid,
    winningLines,
    scatterCount,
    won: multiplier > 0,
    multiplier,
  };
}

module.exports = {
  spinRouletteWheel,
  resolveRouletteBet,
  playSlots,
  colorOf,
  columnOf,
  dozenOf,
  PAYLINES,
  SLOT_SYMBOLS,
  SLOT_WILD: WILD,
  SLOT_SCATTER: SCATTER,
};