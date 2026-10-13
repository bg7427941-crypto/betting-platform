import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { resolveSlotCascades } = require('../../../src/modules/casino/games.engine');
const config = require('../../../src/modules/casino/casino.service').getSlotsConfig();
const grid = [
  ['⭐', '7️⃣', '♠️'],
  ['💎', '7️⃣', '♦️'],
  ['🔔', '7️⃣', '♣️'],
  ['⭐', '♠️', '♥️'],
  ['👑', '♦️', '💎'],
];

async function prepare(page, slotOutcome, blackjackHandler) {
  const requests = [];
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('token', 'browser-test-fixture');
    localStorage.setItem(
      'user',
      JSON.stringify({ id: 'fixture', full_name: 'Cuenta de prueba', role: 'user' })
    );
    localStorage.setItem('bj-sound-muted', 'true');
  });
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith('/api/')) return route.continue();
    if (path === '/api/casino/play') {
      const request = route.request().postDataJSON();
      requests.push(request);
      return route.fulfill({
        json: {
          round: {
            id: `round-${requests.length}`,
            game: 'slots',
            outcome: slotOutcome,
            stake_cents: request.buy_bonus ? 14000 : 500,
            payout_cents: Math.round(slotOutcome.multiplier * 500),
          },
        },
      });
    }
    if (path.includes('/blackjack/') && blackjackHandler)
      return route.fulfill({
        json: { round: blackjackHandler(path, route.request().postDataJSON()) },
      });
    return route.fulfill({
      json:
        path === '/api/wallet'
          ? { balance_cents: 100000 }
          : path.endsWith('/slots/config')
            ? config
            : {},
    });
  });
  await page.goto('/casino');
  return { requests, errors };
}

for (const motion of ['no-preference', 'reduce']) {
  test(`cascades reveal stages and record one payout (${motion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: motion });
    const draws = ['👑', '👑', '👑', '♥️', '💎', '🔔'];
    const cascades = resolveSlotCascades(grid, () => draws.shift());
    const multiplier = cascades.at(-1).runningMultiplier;
    const state = await prepare(page, {
      grid,
      winningLines: cascades[0].winningLines,
      cascades,
      mode: 'cascades',
      multiplier,
      baseMultiplier: multiplier,
      won: true,
      scatterCount: 0,
      bonus: null,
    });
    await page.locator('.casino-game-button').nth(1).click();
    await page.getByRole('button', { name: 'Cascadas Reales', exact: false }).click();
    await page.locator('.slot-spin-btn').click();
    await expect(page.locator('.slot-cascade-reel[data-phase="falling"]').first()).toBeVisible();
    await expect(page.locator('.slot-round-status')).toContainText('Cascada 2 de 3 · ×2');
    await expect(page.locator('.slot-spin-btn')).toBeDisabled();
    await expect(page.locator('.slot-history details')).toHaveCount(1, { timeout: 12000 });
    expect(state.requests).toHaveLength(1);
    expect(state.requests[0].slot_mode).toBe('cascades');
    await expect(page.locator('.session-tracker')).toContainText('264.50');
    await page.locator('.slot-bigwin-dismiss').click();
    const actual = await page
      .locator('.slot-cell')
      .evaluateAll((cells) => cells.map((cell) => cell.dataset.symbol));
    expect(actual).toEqual(cascades.at(-1).grid.flat());
    await page.locator('.slot-history summary').click();
    await expect(page.locator('.slot-history-grid')).toBeVisible();
    await page.waitForTimeout(800);
    expect(state.requests).toHaveLength(1);
    expect(state.errors).toEqual([]);
  });
}

test('free spins can pause for manual advance and reveal the server total exactly once', async ({
  page,
}) => {
  const spins = [1, 2, 3].map((payoutMultiplier, index) => ({
    grid: grid.map((column) => [...column.slice(index), ...column.slice(0, index)]),
    winningLines: [],
    scatterCount: 0,
    payoutMultiplier,
    retriggerAmount: 0,
  }));
  const state = await prepare(page, {
    grid,
    winningLines: [],
    scatterCount: 3,
    mode: 'classic',
    multiplier: 8,
    won: true,
    bonus: { triggerScatterCount: 3, bonusMultiplier: 1.7, spins, totalMultiplier: 6 },
  });
  await page.locator('.casino-game-button').nth(1).click();
  await page.locator('.slot-options summary').click();
  await page.getByLabel('Reproducir giros gratis automáticamente').uncheck();
  await page.locator('.slot-buy-bonus-btn').click();
  await page.getByRole('button', { name: 'Empezar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Siguiente giro gratis' })).toBeVisible();
  await page.waitForTimeout(1400);
  await expect(page.locator('.slot-round-status')).toContainText('Giro gratis 1 de 3');
  await page.getByRole('button', { name: 'Siguiente giro gratis' }).click();
  await expect(page.locator('.slot-round-status')).toContainText('Giro gratis 2 de 3');
  await expect(page.getByRole('button', { name: 'Siguiente giro gratis' })).toBeVisible();
  await page.getByRole('button', { name: 'Ver premio total del bono' }).click();
  await expect(page.locator('.slot-spin-btn')).toBeEnabled();
  await expect(page.locator('.session-tracker')).toContainText('100.00');
  await expect(page.locator('.slot-history details')).toHaveCount(1);
  await expect
    .poll(() =>
      page.locator('.slot-cell').evaluateAll((cells) => cells.map((cell) => cell.dataset.symbol))
    )
    .toEqual(spins.at(-1).grid.flat());
  await page.waitForTimeout(1800);
  expect(state.requests).toHaveLength(1);
  await expect(page.locator('.session-tracker')).toContainText('100.00');
  expect(state.errors).toEqual([]);
});

test('undo removes the last chip amount without altering another bet', async ({ page }) => {
  await prepare(page);
  await page.getByRole('button', { name: '32', exact: true }).click();
  await page.getByRole('button', { name: 'S/10', exact: true }).click();
  await page.getByRole('button', { name: 'Rojo', exact: true }).click();
  await expect(page.locator('.roulette-metrics')).toContainText('15.00');
  await page.getByRole('button', { name: 'Deshacer', exact: true }).click();
  await expect(page.locator('.roulette-metrics')).toContainText('5.00');
  await expect(page.locator('.table-chip')).toHaveCount(1);
  await page.getByRole('button', { name: 'Deshacer', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Girar ruleta', exact: true })).toBeDisabled();
  await expect(page.locator('.table-chip')).toHaveCount(0);
});

function hand(cards, value, active = true) {
  return { cards, value: { value, soft: false }, active };
}
const dealer = [{ rank: '8', suit: '♦' }, { hidden: true }];
const player = [
  { rank: '9', suit: '♣' },
  { rank: '7', suit: '♥' },
];

test('new blackjack cards keep hit, dealer reveal and settlement working', async ({ page }) => {
  let current = null;
  const state = await prepare(page, null, (path) => {
    if (path.endsWith('/start'))
      current = {
        id: 'bj',
        status: 'player_turn',
        stakeCents: 500,
        canDouble: true,
        dealerCards: dealer,
        hands: [hand(player, 16)],
      };
    if (path.endsWith('/hit'))
      current = {
        ...current,
        canDouble: false,
        hands: [hand([...player, { rank: '5', suit: '♠' }], 21)],
      };
    if (path.endsWith('/stand'))
      current = {
        ...current,
        status: 'finished',
        payoutCents: 1000,
        dealerCards: [dealer[0], { rank: '10', suit: '♦' }],
        dealerValue: { value: 18 },
        hands: [
          {
            ...hand([...player, { rank: '5', suit: '♠' }], 21, false),
            resultOutcome: 'win',
            payoutCents: 1000,
          },
        ],
      };
    return current;
  });
  await page.locator('.casino-game-button').nth(2).click();
  await page.getByRole('button', { name: 'Repartir', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Carta boca abajo' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Pedir', exact: true }).click();
  await expect(page.getByRole('img', { name: '5 de picas' })).toBeVisible();
  await expect(page.locator('.bj-decision-panel')).toContainText('21 puntos');
  await page.getByRole('button', { name: 'Plantarme', exact: true }).click();
  await expect(page.getByRole('img', { name: 'Carta boca abajo' })).toHaveCount(0);
  await expect(page.getByRole('img', { name: '10 de diamantes' })).toBeVisible();
  await expect(page.locator('.session-tracker')).toContainText('5.00');
  await page.getByRole('button', { name: 'Jugar de nuevo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Repartir', exact: true })).toBeVisible();
  expect(state.errors).toEqual([]);
});

test('split hands and insurance decisions remain usable in the redesigned table', async ({
  page,
}) => {
  let phase = 'pair';
  let current = {
    id: 'pair',
    status: 'player_turn',
    stakeCents: 500,
    canDouble: true,
    canSplit: true,
    dealerCards: dealer,
    hands: [
      hand(
        [
          { rank: '8', suit: '♥' },
          { rank: '8', suit: '♠' },
        ],
        16
      ),
    ],
  };
  const state = await prepare(page, null, (path) => {
    if (path.endsWith('/split'))
      current = {
        ...current,
        canSplit: false,
        stakeCents: 1000,
        hands: [
          hand(
            [
              { rank: '8', suit: '♥' },
              { rank: '3', suit: '♦' },
            ],
            11
          ),
          hand(
            [
              { rank: '8', suit: '♠' },
              { rank: '2', suit: '♣' },
            ],
            10,
            false
          ),
        ],
      };
    if (phase === 'insurance')
      current = {
        id: 'insurance',
        status: 'insurance_decision',
        stakeCents: 500,
        insuranceMaxCents: 250,
        dealerCards: [{ rank: 'A', suit: '♠' }, { hidden: true }],
        hands: [hand(player, 16)],
      };
    if (path.endsWith('/insurance'))
      current = { ...current, status: 'player_turn', canDouble: true };
    return current;
  });
  await page.locator('.casino-game-button').nth(2).click();
  await page.getByRole('button', { name: 'Dividir', exact: true }).click();
  await expect(page.locator('.bj-hands .bj-hand')).toHaveCount(2);
  await expect(page.locator('.bj-hand-active')).toHaveCount(1);
  phase = 'insurance';
  await page.locator('.casino-game-button').first().click();
  await page.locator('.casino-game-button').nth(2).click();
  await expect(page.getByRole('button', { name: 'Asegurar', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'No, gracias', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pedir', exact: true })).toBeVisible();
  expect(state.errors).toEqual([]);
});

test('all redesigned games fit narrow phones and desktop in both themes', async ({ page }) => {
  await prepare(page, null, () => ({
    id: 'fixture',
    status: 'player_turn',
    stakeCents: 500,
    canDouble: true,
    dealerCards: dealer,
    hands: [hand(player, 16)],
  }));
  for (const game of [0, 1, 2]) {
    await page.locator('.casino-game-button').nth(game).click();
    for (const theme of ['light', 'dark'])
      for (const width of [320, 390, 760, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${game}/${theme}/${width}`
        ).toBe(true);
      }
  }
});
