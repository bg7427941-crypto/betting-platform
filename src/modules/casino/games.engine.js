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
// RTP medido por simulación (~1.2M giros por modo) con el bono ORIGINAL de
// giros gratis (multiplicador fijo por tier, sin coronar carriles) —
// pagos reescalados x1.334 respecto a la versión previa a esa medición:
//   normal            ~94%  (scatter 3+ ~1 de cada 160 giros)
//   ante +25%..+100%  ~94%
//   comprar bono      ~95%
// Esos números YA NO valen tal cual: se agregó el bono "Corona Ascendente"
// (carriles que se vuelven comodín + multiplicador que escala, ver el
// bloque grande más abajo) y el ante/costo de compra del bono se
// recalibraron en casino.service.js para ese bono nuevo — los valores
// actuales de ANTE_TIERS y BUY_BONUS_COST_MULTIPLIER están ahí, con su
// propio comentario de calibración. Esta tabla de SLOT_SYMBOLS (los pagos
// de líneas normales, sin bono) no cambió y sigue siendo la base ~94% de
// la que parte todo lo demás.
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
// BONO "CORONA ASCENDENTE" — se dispara con 3+ scatters (natural, con ante
// boosteado, o garantizado al comprar el bono). A diferencia de un bono de
// giros gratis genérico, acá ningún scatter que cae DURANTE el bono es
// ruido: cuando un carril acumula CROWN_THRESHOLD scatters (no hace falta
// que sea en el mismo giro), se "corona" — su fila del medio queda comodín
// fijo el resto del bono — y cada corona empuja el multiplicador hacia
// arriba. El multiplicador nunca baja: sube con cada carril coronado y con
// cada giro ganador, así que el final del bono siempre paga mejor que el
// arranque. Si se coronan los 5 carriles ("Corona Total") hay un empujón
// único de multiplicador — momento raro, pero vistoso. 3+ scatters en un
// solo giro siguen sumando giros extra ("re-disparo"), igual que antes, y
// de paso pueden coronar varios carriles a la vez (cuenta para los tres).
// =========================================================

const BONUS_TIERS = {
  3: { spins: 8, multiplier: 0.95 },
  4: { spins: 12, multiplier: 1.45 },
  5: { spins: 15, multiplier: 2.4 },
};
const RETRIGGER_SPINS = 5;
const MAX_BONUS_SPINS = 40; // tope de seguridad, incluyendo re-disparos

// Todo este bloque (BONUS_TIERS de arriba incluido) está calibrado en
// conjunto por simulación (ver /tmp/rtp_normal.js y /tmp/rtp_search.js de
// la sesión que hizo este ajuste, ~1-2M giros por punto medido) para que el
// RTP real vuelva a rondar el ~94% del resto del juego. El camino hasta acá
// tuvo dos sorpresas grandes, por si se vuelve a tocar este bono:
//   1. Coronar el carril ENTERO (las 3 filas) con solo 1 scatter llevaba el
//      RTP normal a ~730% — un carril comodín completo es muchísimo más
//      fuerte de lo que parece a simple vista, porque no solo suma pago,
//      multiplica cuántas de las 10 líneas pueden ganar a la vez.
//   2. Con umbral 1 casi cualquier bono terminaba con 2-3 carriles
//      coronados; eso solo (sin ningún multiplicador extra) ya daba ~500%.
// La versión final: CROWN_THRESHOLD=2 (dos scatters acumulados en el mismo
// carril, a lo largo de todo el bono) + solo la fila del medio se vuelve
// comodín (no las 3) + esta escalada moderada. Con eso:
//   normal             ~94-96%  (bonusFreq ~0.6%, bono promedio ~15-17x)
//   ante +25%/+50%/+100%  ~93-98%  (ver el comentario de ANTE_TIERS en
//                                    casino.service.js — la medición es
//                                    ruidosa porque el bono es un evento
//                                    raro y de alta varianza; con más
//                                    muestra (10M+ giros) se podría afinar
//                                    más, pero para pasar a producción con
//                                    dinero real de verdad esa corrida más
//                                    grande hay que hacerla, no alcanza con
//                                    esto)
// Si se cambia CROWN_THRESHOLD, si la fila coronada vuelve a ser el carril
// completo, o si cambian los pesos/payouts base, hay que repetir todo esto
// — el RTP de este bono es muy sensible a esas tres cosas.
const CROWN_MULTIPLIER_BUMP = 0.12; // por cada carril recién coronado
const WIN_STREAK_STEP = 0.025; // por cada giro del bono que paga algo
const CORONA_TOTAL_BONUS = 1; // empujón único al coronar el 5to carril
const CROWN_THRESHOLD = 2; // scatters acumulados en un mismo carril para coronarlo

// Tope de pago del BONO COMPLETO, en veces la apuesta base — el "max win"
// que casi toda tragamonedas real publica. Sin esto, "Corona Total" (los 5
// carriles comodín) deja cada giro restante pagando el máximo de forma
// determinística — se simuló y algunas rondas superaban 80.000× la apuesta
// en una sola ronda de bono, una cifra que fundiría el pozo de cualquier
// operador real. Al llegar al tope, el bono corta ahí mismo (no sigue
// regalando giros que ya pagarían 0) y el frontend debe avisar que se llegó
// al máximo. 5000× es un valor de partida razonable para un slot de esta
// volatilidad, no una cifra de negocio decidida — hay que confirmarla con
// el equipo/regulador antes de producción, junto con la resimulación de RTP
// pendiente (ver comentario de CROWN_MULTIPLIER_BUMP más arriba).
const MAX_BONUS_TOTAL_MULTIPLIER = 5000;

/** Registra los scatters de este giro contra el contador acumulado de cada
 * carril y corona (comodín fijo) cualquiera que llegue a CROWN_THRESHOLD.
 * Devuelve los índices recién coronados este giro; muta `reelHitCounts` y
 * `crownedReels` in-place. */
function registerScatterHits(grid, reelHitCounts, crownedReels) {
  const newlyCrowned = [];
  for (let reel = 0; reel < REELS; reel += 1) {
    if (crownedReels.has(reel)) continue;
    if (!grid[reel].includes(SCATTER)) continue;
    reelHitCounts[reel] += 1;
    if (reelHitCounts[reel] >= CROWN_THRESHOLD) {
      crownedReels.add(reel);
      newlyCrowned.push(reel);
    }
  }
  return newlyCrowned;
}

/** Devuelve un grid nuevo con la fila del medio de cada carril coronado
 * forzada a comodín (no las 3 filas — coronar el carril entero resultó
 * demasiado fuerte en la simulación: con 2-3 carriles comodín completos el
 * RTP del modo normal se iba a más de 200% incluso con el umbral alto).
 * Solo la fila central, que es además donde vive la línea de pago más
 * jugada ("medio"), se vuelve comodín fijo — el resto del carril sigue
 * girando normal. No muta el grid original. */
function applyCrownedReels(grid, crownedReels) {
  return grid.map((column, reel) => {
    if (!crownedReels.has(reel)) return column;
    const next = [...column];
    next[1] = WILD; // fila del medio
    return next;
  });
}

function playFreeSpinsBonus(triggerScatterCount) {
  const tier = BONUS_TIERS[Math.min(triggerScatterCount, 5)];
  let spinsRemaining = tier.spins;
  let spinsAwarded = tier.spins;
  const spins = [];
  let totalMultiplier = 0;
  let currentMultiplier = tier.multiplier;
  const crownedReels = new Set();
  const reelHitCounts = new Array(REELS).fill(0);
  let coronaTotalReached = false;

  while (spinsRemaining > 0 && spins.length < MAX_BONUS_SPINS) {
    const naturalGrid = spinSlotGrid(1); // pesos normales durante el bono
    // Se cuenta el scatter y se decide qué corona ANTES de pintar los
    // comodines fijos, para que coronar un carril nunca "tape" el scatter
    // que lo ganó ni cambie la chance de re-disparo de este mismo giro.
    const scatterCount = countScatters(naturalGrid);
    const newlyCrowned = registerScatterHits(naturalGrid, reelHitCounts, crownedReels);
    const grid = applyCrownedReels(naturalGrid, crownedReels);

    const { lineMultiplierSum, winningLines } = evaluateLines(grid);

    const spinMultiplier = lineMultiplierSum / PAYLINES.length;
    let payoutMultiplier = spinMultiplier * currentMultiplier;
    let capReachedThisSpin = false;
    if (totalMultiplier + payoutMultiplier >= MAX_BONUS_TOTAL_MULTIPLIER) {
      payoutMultiplier = Math.max(0, MAX_BONUS_TOTAL_MULTIPLIER - totalMultiplier);
      capReachedThisSpin = true;
    }
    totalMultiplier += payoutMultiplier;

    let retriggerAmount = 0;
    if (!capReachedThisSpin && scatterCount >= 3 && spinsAwarded < MAX_BONUS_SPINS) {
      retriggerAmount = Math.min(RETRIGGER_SPINS, MAX_BONUS_SPINS - spinsAwarded);
      spinsRemaining += retriggerAmount;
      spinsAwarded += retriggerAmount;
    }

    // La escalada se aplica DESPUÉS de resolver el pago de este giro, para
    // que el multiplicador que el jugador ve subir sea siempre el que va a
    // regir el próximo giro — nunca se autoaplica con efecto retroactivo.
    if (newlyCrowned.length > 0) currentMultiplier += newlyCrowned.length * CROWN_MULTIPLIER_BUMP;
    if (lineMultiplierSum > 0) currentMultiplier += WIN_STREAK_STEP;

    let coronaTotalThisSpin = false;
    if (!coronaTotalReached && crownedReels.size === REELS) {
      coronaTotalReached = true;
      coronaTotalThisSpin = true;
      currentMultiplier += CORONA_TOTAL_BONUS;
    }

    spins.push({
      grid,
      winningLines,
      scatterCount,
      retriggerAmount,
      payoutMultiplier,
      newlyCrowned, // carriles recién coronados en ESTE giro (animar coronación)
      crownedReels: [...crownedReels], // estado acumulado (pintar marco dorado persistente)
      multiplierAfter: currentMultiplier, // valor de la escalera tras este giro
      coronaTotal: coronaTotalThisSpin,
      capReached: capReachedThisSpin,
    });
    spinsRemaining -= 1;
    // Se llegó al tope de pago del bono: no tiene sentido seguir "regalando"
    // giros que ya pagarían 0 — se corta acá y se avisa en el resultado.
    if (capReachedThisSpin) break;
  }

  return {
    triggerScatterCount,
    spinsAwarded,
    bonusMultiplier: tier.multiplier, // rung inicial (compat: es donde arranca la escalera)
    startingMultiplier: tier.multiplier,
    finalMultiplier: currentMultiplier,
    crownedReelsCount: crownedReels.size,
    coronaTotal: crownedReels.size === REELS,
    capReached: spins[spins.length - 1]?.capReached || false,
    spinsPlayed: spins.length, // puede ser < spinsAwarded si se cortó por el tope de pago
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

module.exports = {
  spinRouletteWheel,
  resolveRouletteBet,
  playSlots,
  playFreeSpinsBonus,
  BONUS_TIERS,
  MAX_BONUS_TOTAL_MULTIPLIER,
  colorOf,
  columnOf,
  dozenOf,
  PAYLINES,
  SLOT_SYMBOLS,
  SLOT_WILD: WILD,
  SLOT_SCATTER: SCATTER,
};