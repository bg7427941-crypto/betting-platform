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
  { symbol: '♣️', weight: 20, payout: { 3: 13, 4: 40, 5: 108 } },
  { symbol: '♦️', weight: 20, payout: { 3: 13, 4: 40, 5: 108 } },
  { symbol: '♥️', weight: 18, payout: { 3: 16, 4: 48, 5: 136 } },
  { symbol: '♠️', weight: 18, payout: { 3: 16, 4: 48, 5: 136 } },
  { symbol: '🔔', weight: 12, payout: { 3: 28, 4: 68, 5: 199 } },
  { symbol: '⭐', weight: 10, payout: { 3: 40, 4: 108, 5: 267 } },
  { symbol: '💎', weight: 6, payout: { 3: 68, 4: 199, 5: 681 } },
  { symbol: '👑', weight: 4, payout: { 3: 136, 4: 398, 5: 1361 } },
  { symbol: '7️⃣', weight: 2, payout: { 3: 267, 4: 794, 5: 2666 } },
  // Wild: sustituye a cualquier símbolo pagante en una línea. También puede
  // formar su propia línea si caen 3+ wilds seguidos (payout propio, alto).
  { symbol: WILD, weight: 3, payout: { 3: 199, 4: 681, 5: 1986 } },
  // Scatter: paga en cualquier posición del grid (no necesita estar en una
  // línea ni ser consecutivo) — es el símbolo "de la suerte" que dispara
  // los pagos grandes y vistosos. Multiplica el apostado TOTAL, no por línea.
  { symbol: SCATTER, weight: 3, payout: null },
];

const SYMBOL_PAYOUTS = Object.fromEntries(SLOT_SYMBOLS.map((s) => [s.symbol, s.payout]));
// RTP medido por simulación (~1.2M giros por modo, ver /tmp/final_check.js
// en la sesión que hizo este ajuste) — pagos reescalados x1.334 respecto a
// la versión anterior (que daba ~70.3% real, muy por debajo de lo que decía
// este mismo comentario antes):
//   normal            ~94%  (scatter 3+ ~1 de cada 160 giros)
//   ante +25%         ~94%  (scatterBoost 1.72, ~1 de cada 39)
//   ante +50%         ~94%  (scatterBoost 2.13, ~1 de cada 23)
//   ante +100%        ~94%  (scatterBoost 2.66, ~1 de cada 14)
//   comprar bono      ~95%  (costMultiplier 28, antes 100 → eso daba ~26%
//                             de RTP real, muy por debajo de cualquier otra
//                             apuesta del juego)
// Los cuatro tiers de ANTE_TIERS quedaron calibrados al mismo ~94% real
// (rawRTP / costMultiplier) que el juego normal — antes "ante100" pagaba de
// más de forma sistemática (RTP medido ~170%, se podía farmear saldo
// infinito con ese modo) y los otros dos pagaban de menos de lo que sus
// nombres ("+25%"/"+50%" de costo) hacían pensar.
// OJO: verificar con MINCETUR (o el regulador que corresponda) el RTP
// mínimo exigido antes de llevar esto a producción con dinero real — 94%
// es un valor típico de industria, pero no una cifra legal garantizada en
// ninguna jurisdicción específica. Si se cambia BONUS_TIERS, los pesos o la
// tabla de pagos, hay que volver a simular — el RTP no es obvio a simple
// vista con un motor de bono como este.

const BASE_TOTAL_SLOT_WEIGHT = SLOT_SYMBOLS.reduce((sum, s) => sum + s.weight, 0);

/** Devuelve la tabla de pesos con el peso del scatter multiplicado por `scatterBoost`.
 * `crypto.randomInt` exige límites enteros, y con boosts como 1.5 el peso
 * 3*1.5=4.5 rompía TODOS los giros en esa apuesta ("max must be a safe
 * integer"). En vez de redondear el peso del scatter solo (lo que dejaba
 * apenas ~12 valores de boost distintos, muy poca precisión para calibrar
 * el RTP de cada apuesta ante), escalamos toda la tabla x100: así el boost
 * puede tener 2 decimales de precisión y el peso sigue siendo entero. */
function weightedSymbols(scatterBoost) {
  if (scatterBoost === 1) return { symbols: SLOT_SYMBOLS, totalWeight: BASE_TOTAL_SLOT_WEIGHT };
  const symbols = SLOT_SYMBOLS.map((s) => ({
    ...s,
    weight: s.symbol === SCATTER ? Math.round(s.weight * scatterBoost * 100) : s.weight * 100,
  }));
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

/** Evalúa las 10 líneas de un grid ya girado. No toca el scatter. */
function evaluateLines(grid) {
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
  return { lineMultiplierSum, winningLines };
}

// =========================================================
// BONO DE GIROS GRATIS — se dispara con 3+ scatters (natural, con ante
// boosteado, o garantizado al comprar el bono). Durante el bono cada línea
// ganadora se multiplica por el multiplicador del bono, y si vuelven a caer
// 3+ scatters en un giro gratis, se suman más giros ("re-disparo"), igual
// que en las tragamonedas reales de este estilo.
// =========================================================

const BONUS_TIERS = {
  3: { spins: 8, multiplier: 1.7 },
  4: { spins: 12, multiplier: 2.6 },
  5: { spins: 15, multiplier: 4.3 },
};
const RETRIGGER_SPINS = 5;
const MAX_BONUS_SPINS = 40; // tope de seguridad, incluyendo re-disparos

function playFreeSpinsBonus(triggerScatterCount) {
  const tier = BONUS_TIERS[Math.min(triggerScatterCount, 5)];
  let spinsRemaining = tier.spins;
  let spinsAwarded = tier.spins;
  const spins = [];
  let totalMultiplier = 0;

  while (spinsRemaining > 0 && spins.length < MAX_BONUS_SPINS) {
    const grid = spinSlotGrid(1); // pesos normales durante el bono
    const { lineMultiplierSum, winningLines } = evaluateLines(grid);
    const scatterCount = countScatters(grid);

    let retriggerAmount = 0;
    if (scatterCount >= 3 && spinsAwarded < MAX_BONUS_SPINS) {
      retriggerAmount = Math.min(RETRIGGER_SPINS, MAX_BONUS_SPINS - spinsAwarded);
      spinsRemaining += retriggerAmount;
      spinsAwarded += retriggerAmount;
    }

    const spinMultiplier = lineMultiplierSum / PAYLINES.length;
    const payoutMultiplier = spinMultiplier * tier.multiplier;
    totalMultiplier += payoutMultiplier;

    spins.push({
      grid,
      winningLines,
      scatterCount,
      retriggerAmount,
      payoutMultiplier,
    });
    spinsRemaining -= 1;
  }

  return {
    triggerScatterCount,
    spinsAwarded,
    bonusMultiplier: tier.multiplier,
    spins,
    totalMultiplier,
  };
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

  let bonus = null;
  let bonusMultiplierTotal = 0;
  if (scatterCount >= 3) {
    bonus = playFreeSpinsBonus(scatterCount);
    bonusMultiplierTotal = bonus.totalMultiplier;
  }

  const multiplier = lineMultiplierSum / PAYLINES.length + bonusMultiplierTotal;

  return {
    grid,
    winningLines,
    scatterCount,
    bonus, // null si no se disparó el bono; si no, el detalle giro-por-giro para animar
    won: multiplier > 0,
    multiplier,
  };
}

// =========================================================
// BLACKJACK (mesa clásica, 6 mazos, dealer planta en 17 —
// incluido "17 suave", regla S17. Sin split; doblar solo con 2 cartas).
// =========================================================

const BJ_RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const BJ_SUITS = ['♠', '♥', '♦', '♣'];
const BJ_DECK_COUNT = 6; // zapato de 6 mazos, estándar de mesa

/** Crea un zapato de N mazos ya barajado (Fisher-Yates con crypto.randomInt). */
function createShoe(deckCount = BJ_DECK_COUNT) {
  const shoe = [];
  for (let d = 0; d < deckCount; d += 1) {
    for (const suit of BJ_SUITS) {
      for (const rank of BJ_RANKS) shoe.push({ rank, suit });
    }
  }
  for (let i = shoe.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [shoe[i], shoe[j]] = [shoe[j], shoe[i]];
  }
  return shoe;
}

/** Saca una carta del tope del mazo (muta el array, como una mesa real). */
function drawCard(shoe) {
  if (shoe.length === 0) throw Object.assign(new Error('El zapato se quedó sin cartas'), { status: 500 });
  return shoe.pop();
}

function rankValue(rank) {
  if (rank === 'A') return 11; // se ajusta en handValue() si hace falta
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 10;
  return Number(rank);
}

/**
 * Mejor valor de una mano <=21 tratando los ases como 11 u 1 según convenga.
 * Devuelve { value, soft } — soft=true si hay al menos un as contando como 11.
 */
function handValue(cards) {
  let total = cards.reduce((sum, c) => sum + rankValue(c.rank), 0);
  let aces = cards.filter((c) => c.rank === 'A').length;
  while (total > 21 && aces > 0) {
    total -= 10; // un as pasa de valer 11 a valer 1
    aces -= 1;
  }
  const soft = aces > 0; // queda al menos un as contando como 11
  return { value: total, soft };
}

function isBlackjack(cards) {
  return cards.length === 2 && handValue(cards).value === 21;
}

/** El dealer pide hasta 17 (planta en cualquier 17, incluido "suave"). */
function playDealer(shoe, dealerCards) {
  const cards = [...dealerCards];
  while (handValue(cards).value < 17) {
    cards.push(drawCard(shoe));
  }
  return cards;
}

/**
 * Compara mano de jugador ya cerrada (stand/bust/blackjack) contra el dealer
 * y devuelve el resultado + el multiplicador sobre la apuesta EFECTIVA
 * (ya duplicada si hubo double down).
 * outcome: 'player_blackjack' | 'win' | 'push' | 'loss' | 'bust'
 */
function settleBlackjackHand(playerCards, dealerCardsFinal) {
  const player = handValue(playerCards);
  if (player.value > 21) return { outcome: 'bust', multiplier: 0 };

  const playerBJ = isBlackjack(playerCards);
  const dealerBJ = isBlackjack(dealerCardsFinal);

  if (playerBJ && dealerBJ) return { outcome: 'push', multiplier: 1 };
  if (playerBJ) return { outcome: 'player_blackjack', multiplier: 2.5 }; // paga 3:2 + devuelve apuesta
  if (dealerBJ) return { outcome: 'loss', multiplier: 0 };

  const dealer = handValue(dealerCardsFinal);
  if (dealer.value > 21) return { outcome: 'win', multiplier: 2 };
  if (player.value > dealer.value) return { outcome: 'win', multiplier: 2 };
  if (player.value < dealer.value) return { outcome: 'loss', multiplier: 0 };
  return { outcome: 'push', multiplier: 1 };
}

module.exports = {
  spinRouletteWheel,
  resolveRouletteBet,
  playSlots,
  playFreeSpinsBonus,
  BONUS_TIERS,
  colorOf,
  columnOf,
  dozenOf,
  PAYLINES,
  SLOT_SYMBOLS,
  SLOT_WILD: WILD,
  SLOT_SCATTER: SCATTER,
  createShoe,
  drawCard,
  handValue,
  isBlackjack,
  playDealer,
  settleBlackjackHand,
};