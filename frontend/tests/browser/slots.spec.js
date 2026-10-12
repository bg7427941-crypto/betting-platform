import { test, expect } from '@playwright/test';

const grid = [
  ['7️⃣', '👑', '💎'],
  ['⭐', '👑', '🔔'],
  ['♠️', '👑', '♣️'],
  ['♥️', '💎', '♦️'],
  ['💰', '🃏', '7️⃣'],
];
const outcome = {
  grid,
  winningLines: [{ line: 0, length: 3 }],
  scatterCount: 1,
  multiplier: 2,
  won: true,
};

async function fixture(page, { result = outcome, delay = 0, fail = false } = {}) {
  let calls = 0;
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
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (!path.startsWith('/api/')) return route.continue();
    if (path === '/api/casino/play') {
      calls++;
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      if (fail)
        return route.fulfill({
          status: 503,
          json: { error: 'Servicio temporalmente no disponible' },
        });
      const request = route.request().postDataJSON();
      return route.fulfill({
        json: {
          round: {
            id: `fixture-${calls}`,
            game: 'slots',
            outcome: result,
            stake_cents: request.buy_bonus ? 14000 : 500,
            payout_cents: 1000,
          },
        },
      });
    }
    return route.fulfill({ json: path === '/api/wallet' ? { balance_cents: 200000 } : {} });
  });
  await page.goto('/casino');
  await page.locator('.casino-game-button').nth(1).click();
  await expect(page.locator('.slot-spin-btn')).toBeEnabled();
  return { calls: () => calls, errors };
}

async function expectGrid(page, expected) {
  await expect
    .poll(() =>
      page.locator('.slot-cell').evaluateAll((cells) => cells.map((cell) => cell.dataset.symbol))
    )
    .toEqual(expected.flat());
}

test('normal reels move as five columns, brake gradually and reveal one exact result', async ({
  page,
}) => {
  const state = await fixture(page);
  const started = Date.now();
  await page.evaluate(() => {
    window.stoppedOrder = [];
    const reels = [...document.querySelectorAll('.slot-reel')];
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.target.dataset.phase === 'landed') {
          const reel = reels.indexOf(record.target);
          if (!window.stoppedOrder.includes(reel)) window.stoppedOrder.push(reel);
        }
      }
    });
    reels.forEach((reel) =>
      observer.observe(reel, { attributes: true, attributeFilter: ['data-phase'] })
    );
  });
  await page.locator('.slot-spin-btn').click();
  await expect(page.locator('.slot-reel[data-phase="rolling"]')).toHaveCount(5);
  const durations = await page
    .locator('.slot-reel-track')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAnimations()[0]?.effect.getTiming().duration)
    );
  expect(durations).toEqual([1200, 1200, 1200, 1200, 1200]);
  await expect(page.locator('.slot-reel[data-phase="braking"]').first()).toBeVisible();
  await expect(page.locator('.slot-grid-frame')).toHaveAttribute('data-spinning', 'false');
  expect(Date.now() - started).toBeGreaterThan(1800);
  await expectGrid(page, grid);
  expect(await page.evaluate(() => window.stoppedOrder)).toEqual([0, 1, 2, 3, 4]);
  await expect(page.locator('.slot-lines-overlay polyline')).toHaveCount(1);
  expect(state.calls()).toBe(1);
  await expect(page.locator('.session-tracker')).toContainText('5.00');
  await page.locator('.slot-turbo-toggle').click();
  await page.waitForTimeout(500);
  expect(state.calls()).toBe(1);
  expect(state.errors).toEqual([]);
});

test('a slow server keeps every reel moving until its response arrives', async ({ page }) => {
  const state = await fixture(page, { delay: 2000 });
  await page.locator('.slot-spin-btn').click();
  await page.waitForTimeout(1200);
  await expect(page.locator('.slot-reel[data-phase="rolling"]')).toHaveCount(5);
  const before = await page
    .locator('.slot-reel-track')
    .first()
    .evaluate((node) => getComputedStyle(node).transform);
  await page.waitForTimeout(120);
  const after = await page
    .locator('.slot-reel-track')
    .first()
    .evaluate((node) => getComputedStyle(node).transform);
  expect(after).not.toBe(before);
  await expect(page.locator('.slot-spin-btn')).toBeDisabled();
  await expect(page.locator('.slot-grid-frame')).toHaveAttribute('data-spinning', 'false');
  await expectGrid(page, grid);
  expect(state.calls()).toBe(1);
});

test('fast rhythm remains visible and completes consecutive rounds', async ({ page }) => {
  const state = await fixture(page);
  await page.locator('.slot-turbo-toggle').click();
  for (let round = 0; round < 2; round++) {
    const started = Date.now();
    await page.locator('.slot-spin-btn').click();
    await expect(page.locator('.slot-reel[data-phase="rolling"]')).toHaveCount(5);
    const duration = await page
      .locator('.slot-reel-track')
      .first()
      .evaluate((node) => node.getAnimations()[0].effect.getTiming().duration);
    expect(duration).toBe(900);
    await expect(page.locator('.slot-grid-frame')).toHaveAttribute('data-spinning', 'false');
    expect(Date.now() - started).toBeGreaterThan(850);
    await expectGrid(page, grid);
  }
  expect(state.calls()).toBe(2);
  await expect(page.locator('.session-tracker')).toContainText('10.00');
});

test('reduced motion reveals reels in order with time to read the result', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await fixture(page);
  const started = Date.now();
  await page.locator('.slot-spin-btn').click();
  await expect(page.locator('.slot-reel[data-phase="pending"]')).toHaveCount(5);
  const animations = await page
    .locator('.slot-reel-track')
    .evaluateAll((nodes) => nodes.flatMap((node) => node.getAnimations()));
  expect(animations).toHaveLength(0);
  await page.waitForTimeout(200);
  await expect(page.locator('.slot-grid-frame')).toHaveAttribute('data-spinning', 'true');
  await expect(page.locator('.slot-grid-frame')).toHaveAttribute('data-spinning', 'false');
  expect(Date.now() - started).toBeGreaterThan(1400);
  await expectGrid(page, grid);
});

test('resizing during braking keeps the final tiles aligned with the reel window', async ({
  page,
}) => {
  await fixture(page);
  await page.locator('.slot-spin-btn').click();
  await expect(page.locator('.slot-reel').last()).toHaveAttribute('data-phase', 'braking');
  await page.setViewportSize({ width: 320, height: 1000 });
  const alignment = await page
    .locator('.slot-reel')
    .last()
    .evaluate((reel) => {
      const track = reel.querySelector('.slot-reel-track');
      const animation = track.getAnimations()[0];
      animation.pause();
      animation.currentTime = animation.effect.getTiming().duration - 1;
      const lastFrame = animation.effect.getKeyframes().at(-1);
      const percent = Number(lastFrame.transform.match(/translateY\(([-.\d]+)%\)/)[1]);
      const target = Math.round((-percent / 100) * track.children.length);
      const rest = reel.querySelector('.slot-reel-rest');
      const offsets = Array.from({ length: 3 }, (_, row) =>
        Math.abs(
          track.children[target + row].getBoundingClientRect().top -
            rest.children[row].getBoundingClientRect().top
        )
      );
      animation.play();
      return offsets;
    });
  expect(alignment.every((offset) => offset < 0.1)).toBe(true);
  await expect(page.locator('.slot-grid-frame')).toHaveAttribute('data-spinning', 'false');
  await expectGrid(page, grid);
});

test('every free spin restarts all reels and respects normal rhythm', async ({ page }) => {
  const spins = [0, 1, 2].map((index) => ({
    grid: grid.map((column) => [...column.slice(index), ...column.slice(0, index)]),
    winningLines: [],
    scatterCount: 0,
    payoutMultiplier: index + 1,
    retriggerAmount: 0,
  }));
  const state = await fixture(page, {
    result: {
      ...outcome,
      bonus: { triggerScatterCount: 3, bonusMultiplier: 1.7, spins },
    },
  });
  await page.locator('.slot-options summary').click();
  await page.locator('.slot-buy-bonus-btn').click();
  await page.getByRole('button', { name: 'Empezar', exact: true }).click();
  for (let index = 0; index < spins.length; index++) {
    await expect(page.locator('.slot-round-status')).toContainText(`Giro gratis ${index + 1} de 3`);
    await expect(page.locator('.slot-reel[data-phase="rolling"]')).toHaveCount(5);
    const duration = await page
      .locator('.slot-reel-track')
      .first()
      .evaluate((node) => node.getAnimations()[0].effect.getTiming().duration);
    expect(duration).toBe(1200);
    await expect(page.locator('.slot-grid-frame')).toHaveAttribute('data-spinning', 'false');
    await expectGrid(page, spins[index].grid);
  }
  await expect(page.locator('.slot-bonus-outro-overlay')).toBeVisible();
  await page.locator('.slot-bonus-outro-continue').click();
  await expect(page.locator('.slot-spin-btn')).toBeEnabled();
  expect(state.calls()).toBe(1);
  await expect(page.locator('.session-tracker')).toContainText('130.00');
  await page.waitForTimeout(2500);
  expect(state.calls()).toBe(1);
  expect(state.errors).toEqual([]);
});

test('autoplay under StrictMode sends each spin once and stops after the current round', async ({
  page,
}) => {
  const state = await fixture(page);
  await page.locator('.slot-turbo-toggle').click();
  await page.locator('.slot-options summary').click();
  await page.locator('.slot-autoplay-btn').first().click();
  await expect.poll(state.calls).toBe(2);
  await page.locator('.slot-autoplay-active').click();
  await expect(page.locator('.slot-grid-frame')).toHaveAttribute('data-spinning', 'false');
  await page.waitForTimeout(1200);
  expect(state.calls()).toBe(2);
  await expect(page.locator('.session-tracker')).toContainText('10.00');
  expect(state.errors).toEqual([]);
});

test('leaving a moving game cancels all delayed result callbacks', async ({ page }) => {
  const state = await fixture(page);
  await page.locator('.slot-spin-btn').click();
  await expect(page.locator('.slot-reel[data-phase="rolling"]')).toHaveCount(5);
  await page.locator('.casino-game-button').first().click();
  await page.waitForTimeout(3000);
  await expect(page.locator('.session-tracker')).toContainText('0.00');
  expect(state.errors).toEqual([]);
});

test('an API error cancels movement and lets the user retry', async ({ page }) => {
  const state = await fixture(page, { fail: true });
  await page.locator('.slot-spin-btn').click();
  await expect(page.locator('.error-banner')).toContainText('Servicio temporalmente no disponible');
  await expect(page.locator('.slot-spin-btn')).toBeEnabled();
  await expect(page.locator('.slot-reel[data-phase="idle"]')).toHaveCount(5);
  expect(state.errors).toEqual([]);
});

test('symbols, controls and payment details fit mobile and desktop in both themes', async ({
  page,
}) => {
  await fixture(page);
  await page.locator('.slot-options summary').click();
  await page.locator('.slot-paytable-toggle').click();
  for (const theme of ['dark', 'light']) {
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
    }, theme);
    for (const width of [320, 390, 760, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth
      );
      expect(overflow, `${theme} at ${width}px`).toBe(false);
      await expect(page.locator('.slot-cell .slot-symbol-art')).toHaveCount(15);
      const sizes = await page
        .locator('.slot-cell .slot-symbol-art')
        .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().width));
      expect(sizes.every((size) => size > 20)).toBe(true);
    }
  }
});
