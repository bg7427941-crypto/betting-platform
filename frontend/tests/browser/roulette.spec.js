import { test, expect } from '@playwright/test';

async function fixture(page) {
  let calls = 0;
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
      calls++;
      return route.fulfill({
        json: {
          round: {
            id: `roulette-${calls}`,
            stake_cents: 500,
            payout_cents: 18000,
            outcome: { winningNumber: 32, color: 'red', bets: [] },
          },
        },
      });
    }
    return route.fulfill({ json: path === '/api/wallet' ? { balance_cents: 200000 } : {} });
  });
  await page.goto('/casino');
  await expect(page.getByRole('button', { name: 'Girar ruleta', exact: true })).toBeVisible();
  return () => calls;
}

test('roulette braking preserves initial velocity and aligns repeated winning pockets', async ({
  page,
}) => {
  const calls = await fixture(page);
  for (let round = 1; round <= 2; round++) {
    await page.getByRole('button', { name: '32', exact: true }).click();
    await page.getByRole('button', { name: 'Girar ruleta', exact: true }).click();
    await expect
      .poll(() =>
        page
          .locator('.roulette-rotor')
          .evaluate((node) => node.getAnimations()[0]?.effect.getTiming().iterations)
      )
      .toBe(1);
    const braking = await page.locator('.roulette-rotor').evaluate((node) => {
      const effect = node.getAnimations()[0].effect;
      const frames = effect.getKeyframes();
      const degrees = (frame) => Number(frame.transform.match(/rotate\(([-.\d]+)deg\)/)[1]);
      return {
        distance: degrees(frames[1]) - degrees(frames[0]),
        duration: effect.getTiming().duration,
        easing: effect.getTiming().easing,
      };
    });
    expect(braking.easing).toBe('cubic-bezier(0.25, 0.4, 0.4, 1)');
    expect(Math.abs((braking.distance / braking.duration) * 1.6 - 360 / 1600)).toBeLessThan(0.0001);
    const ballVelocity = await page.locator('.roulette-ball-orbit').evaluate((node) => {
      const effect = node.getAnimations()[0].effect;
      const frames = effect.getKeyframes();
      const degrees = (frame) => Number(frame.transform.match(/rotate\(([-.\d]+)deg\)/)[1]);
      const timing = effect.getTiming();
      const initialY = Number(timing.easing.split(',')[1]);
      return (((degrees(frames[0]) - degrees(frames[1])) / timing.duration) * initialY) / 0.25;
    });
    expect(Math.abs(ballVelocity - 360 / 1100)).toBeLessThan(0.0001);
    await expect(page.locator('.roulette-wheel')).toHaveAttribute('data-spinning', 'false');
    await expect(page.locator('.wheel-result-number')).toHaveText('32');
    const alignment = await page.locator('.roulette-rotor').evaluate((node) => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform);
      const degrees = (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI;
      return (((degrees + (360 / 37) * 1.5) % 360) + 360) % 360;
    });
    expect(Math.min(alignment, 360 - alignment)).toBeLessThan(0.05);
    expect(calls()).toBe(round);
    await expect(page.locator('.session-tracker')).toContainText(`${175 * round}.00`);
  }
});

test('reduced motion keeps a deliberate reveal instead of an instant roulette result', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await fixture(page);
  await page.getByRole('button', { name: '32', exact: true }).click();
  const started = Date.now();
  await page.getByRole('button', { name: 'Girar ruleta', exact: true }).click();
  await expect(page.locator('.roulette-wheel')).toHaveAttribute('data-spinning', 'true');
  await page.waitForTimeout(200);
  await expect(page.locator('.roulette-wheel')).toHaveAttribute('data-spinning', 'true');
  await expect(page.locator('.roulette-wheel')).toHaveAttribute('data-spinning', 'false');
  expect(Date.now() - started).toBeGreaterThan(1300);
  await expect(page.locator('.wheel-result-number')).toHaveText('32');
});
