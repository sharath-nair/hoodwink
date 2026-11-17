import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

export type Phase = 'LOBBY' | 'SUBMITTING' | 'VOTING' | 'REVEAL' | 'SCOREBOARD' | 'GAME_OVER';

export interface Player {
  name: string;
  context: BrowserContext;
  page: Page;
  /** Every raw WebSocket frame this player has received, in order. */
  frames: string[];
}

function recordFrames(page: Page, frames: string[]) {
  page.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(String(f.payload))));
}

/** Each player gets an isolated browser context (own localStorage = own identity). */
export async function newPlayer(browser: Browser, name: string, opts: { clockSkewMs?: number } = {}): Promise<Player> {
  const context = await browser.newContext();
  if (opts.clockSkewMs) {
    // Runs before any app code, so ClockSync captures the skewed Date.now.
    await context.addInitScript((skew) => {
      const real = Date.now.bind(Date);
      Date.now = () => real() + skew;
    }, opts.clockSkewMs);
  }
  const page = await context.newPage();
  const frames: string[] = [];
  recordFrames(page, frames);
  return { name, context, page, frames };
}

/** Host creates a room from the home page; returns the 4-letter code. */
export async function createRoom(host: Player): Promise<string> {
  await host.page.goto('/');
  await host.page.getByLabel('Your name').fill(host.name);
  await host.page.getByRole('button', { name: 'Create room' }).click();
  await host.page.waitForURL(/\/room\/[A-Z]{4}$/);
  return host.page.url().split('/').pop()!;
}

/** Joins via the invite link; a fresh context has no stored name so it prompts for one. */
export async function joinRoom(player: Player, code: string): Promise<void> {
  await player.page.goto(`/room/${code}`);
  await player.page.getByPlaceholder('Your name').fill(player.name);
  await player.page.getByRole('button', { name: 'Join' }).click();
  await expectPhase(player, 'LOBBY');
}

export const phaseLocator = (p: Player, phase: Phase) => p.page.locator(`[data-phase="${phase}"]`);

export async function expectPhase(p: Player, phase: Phase, timeout?: number) {
  await expect(phaseLocator(p, phase)).toBeVisible({ timeout });
}

/** Creates a room and gets `names.length` players into the lobby. */
export async function setupLobby(browser: Browser, names: string[], opts: Record<string, { clockSkewMs?: number }> = {}) {
  const players: Player[] = [];
  for (const name of names) players.push(await newPlayer(browser, name, opts[name]));
  const code = await createRoom(players[0]!);
  for (const p of players.slice(1)) await joinRoom(p, code);
  await expectPhase(players[0]!, 'LOBBY');
  return { players, code, host: players[0]! };
}

export async function startGame(host: Player) {
  const start = host.page.getByRole('button', { name: 'Start game' });
  await expect(start).toBeEnabled();
  await start.click();
}

export const lieOf = (p: Player, round: number) => `secret lie from ${p.name} r${round}`;

export async function submitLie(p: Player, round: number) {
  await expectPhase(p, 'SUBMITTING');
  await p.page.getByPlaceholder('Write something believable…').fill(lieOf(p, round));
  await p.page.getByRole('button', { name: 'Lock it in' }).click();
  // The input disappears once the server accepts the lie. The last submitter goes straight to
  // VOTING (early advance), so don't assert on the intermediate "Your lie" card.
  await expect(p.page.getByPlaceholder('Write something believable…')).toHaveCount(0);
}

/** Votes for the first option that isn't the player's own. */
export async function castVote(p: Player) {
  await expectPhase(p, 'VOTING');
  const option = p.page.locator('[data-phase="VOTING"] ul li button:not([disabled])').first();
  await option.click();
}

/** One full round for everyone, from SUBMITTING through to REVEAL. */
export async function playRound(players: Player[], round: number) {
  for (const p of players) await submitLie(p, round);
  for (const p of players) await castVote(p);
  for (const p of players) await expectPhase(p, 'REVEAL');
}
