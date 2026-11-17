import { expect, test } from '@playwright/test';
import { expectPhase, castVote, playRound, setupLobby, startGame, submitLie, lieOf } from '../helpers';

const NAMES = ['Ann', 'Ben', 'Cy', 'Dee'];

test('4 players play a full 2-round game and return to the lobby', async ({ browser }) => {
  const { players, host } = await setupLobby(browser, NAMES);

  // Only the host sees a start button.
  await expect(players[1]!.page.getByRole('button', { name: 'Start game' })).toHaveCount(0);
  await expect(players[1]!.page.getByText('Waiting for the host to start…')).toBeVisible();
  await startGame(host);

  for (const round of [1, 2]) {
    await playRound(players, round);

    // The reveal shows who wrote what, so every lie is attributed to its author.
    await expect(host.page.getByText('The truth')).toBeAttached();
    for (const p of players) await expect(host.page.getByText(`Written by ${p.name}`).first()).toBeAttached();

    for (const p of players) await expectPhase(p, 'SCOREBOARD', 20_000);
    for (const name of NAMES) await expect(host.page.getByText(name, { exact: true })).toBeVisible();
    if (round === 1) await expect(host.page.getByText('Round 1 / 2')).toBeVisible();
  }

  for (const p of players) await expectPhase(p, 'GAME_OVER', 15_000);
  await expect(host.page.getByText('Master hoodwinker')).toBeVisible();

  // Play again is host-only and resets to a fresh lobby with everyone still seated.
  await expect(players[1]!.page.getByRole('button', { name: 'Play again' })).toHaveCount(0);
  await host.page.getByRole('button', { name: 'Play again' }).click();
  for (const p of players) await expectPhase(p, 'LOBBY');
  await expect(host.page.getByText('Room code')).toBeVisible();
  for (const name of NAMES) await expect(host.page.getByText(name).first()).toBeVisible();
});

test('rejects bad input without breaking the round', async ({ browser }) => {
  const { players, host } = await setupLobby(browser, ['Ann', 'Ben', 'Cy']);
  await startGame(host);
  const ann = players[0]!;
  await expectPhase(ann, 'SUBMITTING');

  // Submit is disabled for blank input.
  await expect(ann.page.getByRole('button', { name: 'Lock it in' })).toBeDisabled();

  // Everyone can still finish normally afterwards.
  for (const p of players) await submitLie(p, 1);
  for (const p of players) await castVote(p);
  await expectPhase(ann, 'REVEAL');
});

test('a late joiner is refused once the game has started', async ({ browser }) => {
  const { host, code } = await setupLobby(browser, ['Ann', 'Ben', 'Cy']);
  await startGame(host);
  await expectPhase(host, 'SUBMITTING');

  const late = await browser.newContext();
  const page = await late.newPage();
  await page.goto(`/room/${code}`);
  await page.getByPlaceholder('Your name').fill('Latecomer');
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.getByText('That game has already started.')).toBeVisible();
  await late.close();
});

test('duplicate names are refused in the lobby', async ({ browser }) => {
  const { code } = await setupLobby(browser, ['Ann', 'Ben']);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`/room/${code}`);
  await page.getByPlaceholder('Your name').fill('ann');
  await page.getByRole('button', { name: 'Join' }).click();
  await expect(page.getByText('Someone already took that name.')).toBeVisible();
  await ctx.close();
});

test('identical lies are merged into a single option', async ({ browser }) => {
  const { players, host } = await setupLobby(browser, ['Ann', 'Ben', 'Cy']);
  await startGame(host);
  const [ann, ben, cy] = players as [typeof players[number], typeof players[number], typeof players[number]];
  await expectPhase(ann, 'SUBMITTING');
  for (const [p, text] of [[ann, 'a zesty rumor'], [ben, 'A Zesty Rumor!'], [cy, 'something else']] as const) {
    await p.page.getByPlaceholder('Write something believable…').fill(text);
    await p.page.getByRole('button', { name: 'Lock it in' }).click();
  }
  await expectPhase(ann, 'VOTING');
  // 2 distinct fakes + the real answer = 3 options, not 4.
  await expect(ann.page.locator('[data-phase="VOTING"] ul li button')).toHaveCount(3);
  void lieOf;
});
