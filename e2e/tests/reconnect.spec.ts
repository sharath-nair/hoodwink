import { expect, test } from '@playwright/test';
import { castVote, expectPhase, lieOf, setupLobby, startGame, submitLie } from '../helpers';

test('a player who drops mid-round keeps their seat when they come back', async ({ browser }) => {
  const { players, host, code } = await setupLobby(browser, ['Ann', 'Ben', 'Cy', 'Dee']);
  const dee = players[3]!;
  await startGame(host);
  await expectPhase(dee, 'SUBMITTING');

  // Dee loses connection (closes the tab). Her token stays in her browser context.
  await dee.page.close();

  // The game does not wait for her: the other three finishing is enough to advance.
  for (const p of players.slice(0, 3)) await submitLie(p, 1);
  await expectPhase(host, 'VOTING');

  // Dee reopens the room in the same context: no name prompt, no "game in progress" refusal.
  const back = await dee.context.newPage();
  await back.goto(`/room/${code}`);
  await expect(back.getByText('That game has already started.')).toHaveCount(0);
  await expect(back.locator('[data-phase="VOTING"]')).toBeVisible();
  // She skipped submitting, so she sees the 3 fakes + the real answer, none of them hers.
  await expect(back.locator('[data-phase="VOTING"] ul li button')).toHaveCount(4);
  await expect(back.getByText('(yours)')).toHaveCount(0);

  // She can vote, and the round completes with her counted again.
  await back.locator('[data-phase="VOTING"] ul li button:not([disabled])').first().click();
  for (const p of players.slice(0, 3)) await castVote(p);
  await expect(host.page.locator('[data-phase="REVEAL"]')).toBeVisible();
  await expect(back.locator('[data-phase="REVEAL"]')).toBeVisible();

  // Same identity throughout: the scoreboard still has exactly four rows, one named Dee.
  await expectPhase(host, 'SCOREBOARD', 20_000);
  await expect(host.page.getByText('Dee', { exact: true })).toHaveCount(1);
  void lieOf;
});

test('the game advances without a player who stays disconnected', async ({ browser }) => {
  const { players, host } = await setupLobby(browser, ['Ann', 'Ben', 'Cy', 'Dee']);
  await startGame(host);
  await players[3]!.context.close(); // Dee is gone for good
  for (const p of players.slice(0, 3)) await submitLie(p, 1);
  await expectPhase(host, 'VOTING');
  for (const p of players.slice(0, 3)) await castVote(p);
  await expectPhase(host, 'REVEAL');
});
