import { expect, test, type Page } from '@playwright/test';
import { expectPhase, setupLobby, startGame } from '../helpers';

const secondsLeft = async (page: Page) => {
  const label = await page.getByRole('timer').getAttribute('aria-label');
  return Number(/(\d+) seconds left/.exec(label ?? '')?.[1]);
};

test('clients with badly skewed clocks still show the same countdown', async ({ browser }) => {
  // Cy's clock is 7s fast, Dee's is 9s slow. Without offset correction they'd disagree by ~16s.
  const { players, host } = await setupLobby(browser, ['Ann', 'Ben', 'Cy', 'Dee'], {
    Cy: { clockSkewMs: 7_000 },
    Dee: { clockSkewMs: -9_000 },
  });
  await startGame(host);
  for (const p of players) await expectPhase(p, 'SUBMITTING');

  // Let the ping burst converge (5 pings, 500ms apart).
  await host.page.waitForTimeout(3_500);

  const left = await Promise.all(players.map((p) => secondsLeft(p.page)));
  const ann = left[0]!;
  // Submit phase is 20s in E2E mode, ~3.5s elapsed.
  expect(ann).toBeGreaterThan(12);
  expect(ann).toBeLessThanOrEqual(17);
  for (const [i, value] of left.entries()) {
    expect(Math.abs(value! - ann), `${players[i]!.name} (${value}s) vs Ann (${ann}s)`).toBeLessThanOrEqual(1);
  }
});

test('the server, not any client, moves the game on when the timer expires', async ({ browser }) => {
  const { players, host } = await setupLobby(browser, ['Ann', 'Ben', 'Cy']);
  await startGame(host);
  for (const p of players) await expectPhase(p, 'SUBMITTING');

  // Nobody submits. After the 20s deadline the server fills fallbacks and everyone lands in VOTING together.
  for (const p of players) await expectPhase(p, 'VOTING', 30_000);
  await expect(host.page.locator('[data-phase="VOTING"] ul li button')).toHaveCount(4);
});
