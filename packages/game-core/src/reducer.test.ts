import { describe, expect, it } from 'vitest';
import { createRoom, reduce, viewFor, type Deps, type GameEvent, type Question, type Room } from './index';

const QUESTIONS: Question[] = [{ id: 'q1', prompt: 'A banana is a ___.', realAnswer: 'berry' }];
const FALLBACKS = ['Soup, probably', 'Tax fraud'];

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeDeps(now: number, seed = 1): Deps {
  return { now, rng: mulberry32(seed), questions: QUESTIONS, fallbacks: FALLBACKS };
}

/** Dispatch a sequence of events, asserting none are rejected unless told otherwise. */
function run(room: Room, now: number, ...events: GameEvent[]): Room {
  return events.reduce((r, e) => {
    const res = reduce(r, e, makeDeps(now));
    expect(res.rejected, `${e.type} rejected: ${res.rejected}`).toBeUndefined();
    return res.room;
  }, room);
}

function lobby(n = 3): Room {
  const ids = ['alice', 'bob', 'cara', 'dan', 'eve'].slice(0, n);
  return run(
    createRoom('ABCD', { totalRounds: 2 }),
    0,
    ...ids.map((id): GameEvent => ({ type: 'JOIN', playerId: id, name: id.toUpperCase() })),
  );
}

function submitting(n = 3): Room {
  return run(lobby(n), 1000, { type: 'START_GAME', playerId: 'alice' });
}

function voting(): Room {
  return run(
    submitting(),
    2000,
    { type: 'SUBMIT', playerId: 'alice', text: 'a fruit' },
    { type: 'SUBMIT', playerId: 'bob', text: 'a vegetable' },
    { type: 'SUBMIT', playerId: 'cara', text: 'a nut' },
  );
}

const idOf = (r: Room, text: string) => r.answers.find((a) => a.text === text)!.id;

describe('lobby', () => {
  it('makes the first joiner host and rejects duplicate names', () => {
    const r = lobby();
    expect(r.hostId).toBe('alice');
    const dup = reduce(r, { type: 'JOIN', playerId: 'zed', name: ' bob ' }, makeDeps(0));
    expect(dup.rejected).toBe('NAME_TAKEN');
  });

  it('requires the host and enough players to start', () => {
    expect(reduce(lobby(), { type: 'START_GAME', playerId: 'bob' }, makeDeps(0)).rejected).toBe('NOT_HOST');
    expect(reduce(lobby(2), { type: 'START_GAME', playerId: 'alice' }, makeDeps(0)).rejected).toBe('TOO_FEW_PLAYERS');
  });

  it('migrates host when the host leaves', () => {
    const r = run(lobby(), 0, { type: 'DISCONNECT', playerId: 'alice' });
    expect(r.hostId).toBe('bob');
    expect(r.players['alice']).toBeUndefined();
  });

  it('does not mutate its input', () => {
    const r = lobby();
    const snapshot = JSON.stringify(r);
    reduce(r, { type: 'START_GAME', playerId: 'alice' }, makeDeps(1000));
    expect(JSON.stringify(r)).toBe(snapshot);
  });
});

describe('submitting', () => {
  it('starts a round with an absolute deadline', () => {
    const r = submitting();
    expect(r.phase).toBe('SUBMITTING');
    expect(r.phaseEndsAt).toBe(1000 + r.config.submitMs);
  });

  it('rejects an answer matching the real one (case/punctuation-insensitive)', () => {
    const res = reduce(submitting(), { type: 'SUBMIT', playerId: 'bob', text: ' BERRY! ' }, makeDeps(1500));
    expect(res.rejected).toBe('MATCHES_REAL');
  });

  it('rejects empty, oversized and repeat submissions', () => {
    const r = submitting();
    expect(reduce(r, { type: 'SUBMIT', playerId: 'bob', text: '   ' }, makeDeps(1500)).rejected).toBe('EMPTY_ANSWER');
    expect(reduce(r, { type: 'SUBMIT', playerId: 'bob', text: 'x'.repeat(61) }, makeDeps(1500)).rejected).toBe('ANSWER_TOO_LONG');
    const once = run(r, 1500, { type: 'SUBMIT', playerId: 'bob', text: 'a nut' });
    expect(reduce(once, { type: 'SUBMIT', playerId: 'bob', text: 'a seed' }, makeDeps(1600)).rejected).toBe('ALREADY_SUBMITTED');
  });

  it('advances early once every connected player has submitted', () => {
    const r = voting();
    expect(r.phase).toBe('VOTING');
    expect(r.answers).toHaveLength(4); // 3 fakes + real
  });

  it('auto-fills fallbacks for stragglers when the timer expires', () => {
    let r = run(submitting(), 2000, { type: 'SUBMIT', playerId: 'alice', text: 'a fruit' });
    r = run(r, r.phaseEndsAt!, { type: 'TIMER_EXPIRED' });
    expect(r.phase).toBe('VOTING');
    expect(FALLBACKS).toContain(r.submissions['bob']);
    expect(FALLBACKS).toContain(r.submissions['cara']);
    expect(r.submissions['bob']).not.toBe(r.submissions['cara']);
  });

  it('does not wait for disconnected players', () => {
    let r = run(submitting(), 1500, { type: 'DISCONNECT', playerId: 'cara' });
    r = run(
      r,
      2000,
      { type: 'SUBMIT', playerId: 'alice', text: 'a fruit' },
      { type: 'SUBMIT', playerId: 'bob', text: 'a vegetable' },
    );
    expect(r.phase).toBe('VOTING');
    expect(r.submissions['cara']).toBeUndefined();
  });

  it('ignores stale timer alarms', () => {
    const res = reduce(submitting(), { type: 'TIMER_EXPIRED' }, makeDeps(5000));
    expect(res.rejected).toBe('TIMER_NOT_DUE');
  });
});

describe('voting and scoring', () => {
  it('merges identical fakes into one answer with two authors', () => {
    const r = run(
      submitting(),
      2000,
      { type: 'SUBMIT', playerId: 'alice', text: 'a fruit' },
      { type: 'SUBMIT', playerId: 'bob', text: 'A Fruit!' },
      { type: 'SUBMIT', playerId: 'cara', text: 'a nut' },
    );
    expect(r.answers).toHaveLength(3);
    expect(r.answers.find((a) => a.authorIds.length === 2)?.authorIds.sort()).toEqual(['alice', 'bob']);
  });

  it('forbids voting for your own answer and double voting', () => {
    const r = voting();
    expect(reduce(r, { type: 'VOTE', playerId: 'alice', answerId: idOf(r, 'a fruit') }, makeDeps(2500)).rejected).toBe('OWN_ANSWER');
    const voted = run(r, 2500, { type: 'VOTE', playerId: 'alice', answerId: idOf(r, 'a nut') });
    expect(reduce(voted, { type: 'VOTE', playerId: 'alice', answerId: idOf(voted, 'a nut') }, makeDeps(2600)).rejected).toBe('ALREADY_VOTED');
  });

  it('awards points for truth and for fooling, then reveals', () => {
    const r0 = voting();
    const real = r0.answers.find((a) => a.isReal)!.id;
    const r = run(
      r0,
      2500,
      { type: 'VOTE', playerId: 'alice', answerId: real }, // finds the truth: +1000
      { type: 'VOTE', playerId: 'bob', answerId: idOf(r0, 'a nut') }, // fooled by cara: cara +500
      { type: 'VOTE', playerId: 'cara', answerId: idOf(r0, 'a nut') === idOf(r0, 'a fruit') ? real : idOf(r0, 'a fruit') }, // fooled by alice: alice +500
    );
    expect(r.phase).toBe('REVEAL');
    expect(r.players['alice']!.score).toBe(1500);
    expect(r.players['cara']!.score).toBe(500);
    expect(r.players['bob']!.score).toBe(0);
    expect(r.roundDeltas).toEqual({ alice: 1500, cara: 500 });
  });

  it('plays a full game: next round, then GAME_OVER, then back to lobby', () => {
    let r = voting();
    r = run(r, r.phaseEndsAt!, { type: 'TIMER_EXPIRED' }); // VOTING -> REVEAL
    expect(r.phase).toBe('REVEAL');
    r = run(r, 0, { type: 'SKIP', playerId: 'alice' }); // -> SCOREBOARD
    expect(r.phase).toBe('SCOREBOARD');
    r = run(r, r.phaseEndsAt!, { type: 'TIMER_EXPIRED' }); // -> round 2
    expect(r.phase).toBe('SUBMITTING');
    expect(r.round).toBe(2);
    r = run(r, r.phaseEndsAt!, { type: 'TIMER_EXPIRED' }); // fallbacks -> VOTING
    r = run(r, r.phaseEndsAt!, { type: 'TIMER_EXPIRED' }); // -> REVEAL
    r = run(r, r.phaseEndsAt!, { type: 'TIMER_EXPIRED' }); // -> SCOREBOARD
    r = run(r, r.phaseEndsAt!, { type: 'TIMER_EXPIRED' }); // -> GAME_OVER
    expect(r.phase).toBe('GAME_OVER');
    expect(r.phaseEndsAt).toBeNull();
    r = run(r, 0, { type: 'PLAY_AGAIN', playerId: 'alice' });
    expect(r.phase).toBe('LOBBY');
    expect(Object.values(r.players).every((p) => p.score === 0)).toBe(true);
  });
});

describe('reconnection', () => {
  it('lets a disconnected player rejoin mid-game under the same id', () => {
    let r = run(submitting(), 1500, { type: 'DISCONNECT', playerId: 'bob' });
    expect(r.players['bob']!.isConnected).toBe(false);
    r = run(r, 1600, { type: 'JOIN', playerId: 'bob', name: 'ignored' });
    expect(r.players['bob']!.isConnected).toBe(true);
    expect(r.players['bob']!.name).toBe('BOB');
  });

  it('rejects brand-new players once the game has started', () => {
    expect(reduce(submitting(), { type: 'JOIN', playerId: 'zed', name: 'Zed' }, makeDeps(1500)).rejected).toBe('GAME_IN_PROGRESS');
  });
});

describe('viewFor (information secrecy)', () => {
  it('never leaks the real answer or authorship before REVEAL', () => {
    for (const r of [submitting(), voting()]) {
      for (const pid of ['alice', 'bob', 'cara']) {
        const view = viewFor(r, pid);
        const json = JSON.stringify(view);
        expect(view.realAnswer).toBeNull();
        expect(json).not.toContain('authorIds');
        expect(json).not.toContain('voterIds');
        expect(json).not.toContain('isReal');
        // The real text may only appear as one anonymous option, once VOTING starts.
        if (r.phase === 'SUBMITTING') expect(json).not.toContain('berry');
      }
    }
  });

  it('gives every voting option the same shape so the real answer is indistinguishable', () => {
    const view = viewFor(voting(), 'alice');
    const shapes = new Set(view.answers.map((a) => Object.keys(a).sort().join(',')));
    expect(shapes.size).toBe(1);
    expect(view.answers.every((a) => a.reveal === null)).toBe(true);
  });

  it('shows a player only their own submission during SUBMITTING', () => {
    const r = run(submitting(), 1500, { type: 'SUBMIT', playerId: 'bob', text: 'a vegetable' });
    expect(viewFor(r, 'bob').myAnswer).toBe('a vegetable');
    expect(viewFor(r, 'alice').myAnswer).toBeNull();
    expect(JSON.stringify(viewFor(r, 'alice'))).not.toContain('a vegetable');
    expect(viewFor(r, 'alice').submitted).toEqual(['bob']); // who has finished is fine to show
  });

  it('flags only the viewer\'s own answers as mine, with no authors', () => {
    const r = voting();
    const mine = viewFor(r, 'alice').answers.filter((a) => a.isMine);
    expect(mine.map((a) => a.text)).toEqual(['a fruit']);
  });

  it('reveals the real answer, authors and voters at REVEAL', () => {
    const r0 = voting();
    const real = r0.answers.find((a) => a.isReal)!.id;
    const r = run(
      r0,
      2500,
      { type: 'VOTE', playerId: 'alice', answerId: real },
      { type: 'VOTE', playerId: 'bob', answerId: real },
      { type: 'VOTE', playerId: 'cara', answerId: real },
    );
    const v = viewFor(r, 'alice');
    expect(v.realAnswer).toBe('berry');
    const realView = v.answers.find((a) => a.id === real)!;
    expect(realView.reveal?.isReal).toBe(true);
    expect(realView.reveal?.voterIds.sort()).toEqual(['alice', 'bob', 'cara']);
    const fruit = v.answers.find((a) => a.text === 'a fruit')!;
    expect(fruit.reveal?.authorIds).toEqual(['alice']);
  });
});
