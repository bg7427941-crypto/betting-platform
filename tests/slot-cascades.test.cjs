const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {
  resolveSlotCascades,
  playSlots,
  SLOT_SYMBOLS,
} = require('../src/modules/casino/games.engine');
const { getSlotsConfig, playRound } = require('../src/modules/casino/casino.service');

const grid = [
  ['⭐', '7️⃣', '♠️'],
  ['💎', '7️⃣', '♦️'],
  ['🔔', '7️⃣', '♣️'],
  ['⭐', '♠️', '♥️'],
  ['👑', '♦️', '💎'],
];

function mockDraws(t, symbols) {
  const rolls = symbols.map((symbol) => {
    const index = SLOT_SYMBOLS.findIndex((item) => item.symbol === symbol);
    return SLOT_SYMBOLS.slice(0, index).reduce((sum, item) => sum + item.weight, 0);
  });
  t.mock.method(crypto, 'randomInt', () => (rolls.length ? rolls.shift() : 0));
}

test('cascades preserve survivors, replace only winning cells and add progressive prizes', () => {
  const draws = ['👑', '👑', '👑', '♥️', '💎', '🔔'];
  const frames = resolveSlotCascades(grid, () => draws.shift());
  assert.equal(frames.length, 3);
  assert.deepEqual(frames[0].grid, grid);
  assert.deepEqual(frames[1].grid[0], ['👑', '⭐', '♠️']);
  assert.deepEqual(frames[1].grid[3], grid[3]);
  assert.deepEqual(frames[1].removedCells, [
    { reel: 0, row: 1 },
    { reel: 1, row: 1 },
    { reel: 2, row: 1 },
  ]);
  assert.equal(frames[0].payoutMultiplier, 26.7);
  assert.equal(frames[1].payoutMultiplier, 27.2);
  assert.equal(frames[2].payoutMultiplier, 0);
  assert.ok(Math.abs(frames[2].runningMultiplier - 53.9) < 1e-10);
  assert.deepEqual(grid[0], ['⭐', '7️⃣', '♠️']);
  assert.equal(draws.length, 0);
});

test('overlapping paylines clear each position once and an endless winning draw stops at four stages', () => {
  const sevens = Array.from({ length: 5 }, () => ['7️⃣', '7️⃣', '7️⃣']);
  let draws = 0;
  const frames = resolveSlotCascades(sevens, () => {
    draws++;
    return '7️⃣';
  });
  assert.equal(frames.length, 4);
  assert.equal(draws, 45);
  assert.equal(frames[1].removedCells.length, 15);
  assert.equal(new Set(frames[1].removedCells.map((cell) => `${cell.reel}-${cell.row}`)).size, 15);
  assert.equal(frames[3].runningMultiplier, 26660);
});

test('a nonwinning grid cannot regenerate or acquire a phantom payout', () => {
  const losing = [
    ['7️⃣', '💎', '⭐'],
    ['👑', '🔔', '♠️'],
    ['♥️', '♣️', '♦️'],
    ['⭐', '7️⃣', '💎'],
    ['♠️', '👑', '🔔'],
  ];
  const frames = resolveSlotCascades(losing, () => {
    throw new Error('Unexpected draw');
  });
  assert.equal(frames.length, 1);
  assert.equal(frames[0].runningMultiplier, 0);
});

test('classic retains its payout and does not draw cascade symbols', (t) => {
  mockDraws(t, grid.flat());
  const outcome = playSlots();
  assert.equal(outcome.mode, 'classic');
  assert.equal(outcome.cascades, null);
  assert.equal(outcome.multiplier, 26.7);
  assert.equal(outcome.bonus, null);
});

test('three bonus symbols appearing during a cascade activate exactly one free-spin bonus', (t) => {
  mockDraws(t, [...grid.flat(), '💰', '💰', '💰']);
  const outcome = playSlots({ mode: 'cascades' });
  assert.equal(outcome.cascades.length, 2);
  assert.equal(outcome.scatterCount, 3);
  assert.equal(outcome.bonus.spinsAwarded, 8);
  assert.equal(outcome.bonus.spins.length, 8);
  assert.ok(
    Math.abs(outcome.multiplier - outcome.baseMultiplier - outcome.bonus.totalMultiplier) < 1e-9
  );
});

test('unsupported modes are rejected before randomness or a wallet transaction', async (t) => {
  t.mock.method(crypto, 'randomInt', () => {
    throw new Error('Unexpected RNG');
  });
  assert.throws(
    () => playSlots({ mode: '__proto__' }),
    (error) => error.status === 400
  );
  await assert.rejects(
    playRound('fixture', { game: 'slots', stakeCents: 500, slotMode: 'unknown' }),
    (error) => error.status === 400
  );
});

test('published paytable and bonus rules match the actual engine', () => {
  const config = getSlotsConfig();
  assert.deepEqual(config.modes.cascades.multipliers, [1, 2, 3, 4]);
  assert.deepEqual(config.paytable.find((row) => row.symbol === '7️⃣').payout, {
    3: 267,
    4: 794,
    5: 2666,
  });
  assert.equal(config.bonusTiers[3].spins, 8);
});
