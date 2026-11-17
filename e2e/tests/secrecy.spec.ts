import { expect, test } from '@playwright/test';
import { expectPhase, lieOf, playRound, setupLobby, startGame, submitLie, castVote, type Player } from '../helpers';

interface StateMsg {
  type: 'state';
  view: { phase: string; realAnswer: string | null };
}

const parse = (p: Player) =>
  p.frames.map((raw) => ({ raw, msg: JSON.parse(raw) as { type: string } & Partial<StateMsg> })).filter((f) => f.msg.type === 'state') as {
    raw: string;
    msg: StateMsg;
  }[];

test('no frame leaks the real answer or authorship before REVEAL', async ({ browser }) => {
  const { players, host } = await setupLobby(browser, ['Ann', 'Ben', 'Cy']);
  await startGame(host);
  await playRound(players, 1);

  for (const p of players) {
    const states = parse(p);
    expect(states.length).toBeGreaterThan(3);

    const secretPhases = new Set(['LOBBY', 'SUBMITTING', 'VOTING']);
    for (const { raw, msg } of states.filter((s) => secretPhases.has(s.msg.view.phase))) {
      expect(msg.view.realAnswer, `${p.name} saw the real answer during ${msg.view.phase}`).toBeNull();
      for (const key of ['authorIds', 'voterIds', 'isReal']) {
        expect(raw, `${p.name} frame in ${msg.view.phase} contains "${key}"`).not.toContain(key);
      }
    }

    // Sanity: once revealed, the answer IS delivered (otherwise the check above proves nothing).
    expect(states.some((s) => s.msg.view.phase === 'REVEAL' && typeof s.msg.view.realAnswer === 'string')).toBe(true);
  }
});

test("during SUBMITTING a player never receives anyone else's lie", async ({ browser }) => {
  const { players, host } = await setupLobby(browser, ['Ann', 'Ben', 'Cy']);
  await startGame(host);
  for (const p of players) await submitLie(p, 1);
  for (const p of players) await castVote(p);
  await expectPhase(host, 'REVEAL');

  for (const p of players) {
    const others = players.filter((o) => o !== p).map((o) => lieOf(o, 1));
    for (const { raw, msg } of parse(p).filter((s) => s.msg.view.phase === 'SUBMITTING')) {
      for (const lie of others) expect(raw, `${p.name} got ${lie} while still submitting`).not.toContain(lie);
      void msg;
    }
  }
});

test('the real answer is indistinguishable from the fakes on the voting screen', async ({ browser }) => {
  const { players, host } = await setupLobby(browser, ['Ann', 'Ben', 'Cy']);
  await startGame(host);
  for (const p of players) await submitLie(p, 1);
  await expectPhase(host, 'VOTING');

  // Same element structure for every option: nothing marks the truth in the DOM either.
  const options = host.page.locator('[data-phase="VOTING"] ul li button');
  await expect(options).toHaveCount(4);
  const shapes = await options.evaluateAll((els) => els.map((el) => `${el.tagName}|${el.children.length}|${el.getAttributeNames().filter((n) => n !== 'class').sort().join(',')}`));
  expect(new Set(shapes).size).toBeLessThanOrEqual(2); // 'mine' differs only by a "(yours)" span and disabled attr
  const html = await host.page.locator('[data-phase="VOTING"]').innerHTML();
  expect(html).not.toMatch(/isReal|The truth/);
});
