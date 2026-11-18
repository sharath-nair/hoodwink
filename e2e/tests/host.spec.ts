import { expect, test } from '@playwright/test';
import {
  castVote,
  expectPhase,
  lieOf,
  newPlayer,
  openHostScreen,
  playRound,
  rawSocket,
  setupLobby,
  startGame,
  submitLie,
  joinRoom,
} from '../helpers';

const NAMES = ['Ann', 'Ben', 'Cy'];

test('/host creates a room and phones can join it', async ({ browser }) => {
  const tv = await newPlayer(browser, 'TV');
  await tv.page.goto('/host');
  await tv.page.waitForURL(/\/host\/[A-Z]{4}$/);
  const code = tv.page.url().split('/').pop()!;
  await expectPhase(tv, 'LOBBY');
  await expect(tv.page.getByText(code, { exact: true })).toBeVisible();
  await expect(tv.page.locator('svg').first()).toBeVisible(); // QR code
  await expect(tv.page.getByText('Waiting for players…')).toBeVisible();

  const ann = await newPlayer(browser, 'Ann');
  await joinRoom(ann, code);
  await expect(tv.page.getByText('Ann')).toBeVisible();
  await expect(tv.page.getByText('1 in the room')).toBeVisible();
});

test('the big screen follows a full game and never lets spectators act', async ({ browser }) => {
  const { players, host, code } = await setupLobby(browser, NAMES);
  const tv = await openHostScreen(browser, code);
  for (const name of NAMES) await expect(tv.page.getByText(name).first()).toBeVisible();

  await startGame(host);
  await expectPhase(tv, 'SUBMITTING');
  // The TV shows the prompt and live progress, but not what anyone wrote.
  await expect(tv.page.getByText('Write your best lie on your phone')).toBeVisible();
  await submitLie(players[0]!, 1);
  await expect(tv.page.getByText('Ann ✓')).toBeVisible();
  await expect(tv.page.getByText(lieOf(players[0]!, 1))).toHaveCount(0);
  for (const p of players.slice(1)) await submitLie(p, 1);

  await expectPhase(tv, 'VOTING');
  await expect(tv.page.locator('[data-phase="VOTING"] ul li').first()).toBeVisible();
  await expect(tv.page.locator('[data-phase="VOTING"] ul').first().locator('li')).toHaveCount(4);
  for (const p of players) await castVote(p);

  await expectPhase(tv, 'REVEAL');
  await expect(tv.page.getByText('The truth')).toBeAttached();
  for (const p of players) await expect(tv.page.getByText(`Written by ${p.name}`).first()).toBeAttached();
  await expectPhase(tv, 'SCOREBOARD', 20_000);
  await expect(tv.page.getByText('Scoreboard')).toBeVisible();

  // Round 2 through to the end.
  await playRound(players, 2);
  await expectPhase(tv, 'GAME_OVER', 40_000);
  await expect(tv.page.getByText('Master hoodwinker')).toBeVisible();
});

test('the spectator feed carries no private state and no secrets before REVEAL', async ({ browser }) => {
  const { players, host, code } = await setupLobby(browser, NAMES);
  const tv = await openHostScreen(browser, code);
  await startGame(host);
  await playRound(players, 1);
  await expectPhase(tv, 'REVEAL');

  const frames = tv.frames.map((raw) => ({ raw, msg: JSON.parse(raw) as { type: string; view?: { phase: string; realAnswer: string | null } } }));
  const publics = frames.filter((f) => f.msg.type === 'public');
  expect(publics.length).toBeGreaterThan(3);
  // A spectator never receives a per-player "state" frame.
  expect(frames.filter((f) => f.msg.type === 'state')).toHaveLength(0);

  for (const { raw, msg } of publics) {
    for (const key of ['myAnswer', 'myVote', '"you"', 'canStart']) expect(raw, `public frame leaked ${key}`).not.toContain(key);
    if (['LOBBY', 'SUBMITTING', 'VOTING'].includes(msg.view!.phase)) {
      expect(msg.view!.realAnswer).toBeNull();
      for (const key of ['authorIds', 'voterIds', 'isReal']) expect(raw, `${msg.view!.phase} frame leaked ${key}`).not.toContain(key);
    }
    if (msg.view!.phase === 'SUBMITTING') {
      for (const p of players) expect(raw, `TV saw ${p.name}'s lie while submitting`).not.toContain(lieOf(p, 1));
    }
  }
  expect(publics.some((f) => f.msg.view!.phase === 'REVEAL' && typeof f.msg.view!.realAnswer === 'string')).toBe(true);
});

test('a spectator socket cannot start, submit, vote, skip or join', async ({ browser }) => {
  const { host, code } = await setupLobby(browser, NAMES);
  const spy = await rawSocket(code);
  spy.send({ type: 'watch' });
  for (const m of [{ type: 'start' }, { type: 'submit', text: 'hax' }, { type: 'vote', answerId: 'ans_1' }, { type: 'skip' }, { type: 'playAgain' }]) spy.send(m);
  spy.send({ type: 'join', name: 'Sneaky' });
  await expect.poll(() => spy.errors().length, { timeout: 5_000 }).toBe(6);

  expect(spy.errors().slice(0, 5)).toEqual(Array(5).fill('NOT_JOINED'));
  expect(spy.errors()[5]).toBe('BAD_MESSAGE'); // spectators can't become players
  spy.close();

  // The game is untouched: still in the lobby, nobody named Sneaky.
  await expectPhase(host, 'LOBBY');
  await expect(host.page.getByText('Sneaky')).toHaveCount(0);
});

test('a player connection cannot be turned into a spectator', async ({ browser }) => {
  const { code } = await setupLobby(browser, ['Ann']);
  const ws = await rawSocket(code);
  ws.send({ type: 'join', name: 'Mallory' });
  await expect.poll(() => ws.messages.some((m) => m.type === 'welcome')).toBe(true);
  ws.send({ type: 'watch' });
  await expect.poll(() => ws.errors()).toEqual(['BAD_MESSAGE']);
  ws.close();
});
