import { DEFAULT_CONFIG, type Config } from './config';
import type { Answer, Question, ReduceResult, RejectCode, Room } from './types';

export type GameEvent =
  | { type: 'JOIN'; playerId: string; name: string }
  | { type: 'DISCONNECT'; playerId: string }
  | { type: 'START_GAME'; playerId: string }
  | { type: 'SUBMIT'; playerId: string; text: string }
  | { type: 'VOTE'; playerId: string; answerId: string }
  | { type: 'SKIP'; playerId: string }
  | { type: 'PLAY_AGAIN'; playerId: string }
  | { type: 'TIMER_EXPIRED' };

/** Everything non-deterministic is injected, so the reducer stays pure and trivially testable. */
export interface Deps {
  now: number;
  rng: () => number;
  questions: readonly Question[];
  fallbacks: readonly string[];
}

export function createRoom(code: string, config: Partial<Config> = {}): Room {
  return {
    code,
    phase: 'LOBBY',
    hostId: null,
    round: 0,
    config: { ...DEFAULT_CONFIG, ...config },
    players: {},
    playerOrder: [],
    question: null,
    submissions: {},
    answers: [],
    votes: {},
    roundDeltas: {},
    phaseEndsAt: null,
    usedQuestionIds: [],
  };
}

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Pure transition function. Never mutates `room`; returns the same reference
 * plus a `rejected` code when the event is invalid for the current state.
 */
export function reduce(room: Room, event: GameEvent, deps: Deps): ReduceResult {
  const draft = structuredClone(room);
  const rejected = apply(draft, event, deps);
  return rejected ? { room, rejected } : { room: draft };
}

type Outcome = RejectCode | null;

function apply(r: Room, e: GameEvent, d: Deps): Outcome {
  switch (e.type) {
    case 'JOIN':
      return join(r, e.playerId, e.name);
    case 'DISCONNECT':
      return disconnect(r, e.playerId, d);
    case 'START_GAME': {
      if (r.hostId !== e.playerId) return 'NOT_HOST';
      if (r.phase !== 'LOBBY') return 'BAD_PHASE';
      if (connectedIds(r).length < r.config.minPlayers) return 'TOO_FEW_PLAYERS';
      startRound(r, d, 1);
      return null;
    }
    case 'SUBMIT':
      return submit(r, e.playerId, e.text, d);
    case 'VOTE':
      return vote(r, e.playerId, e.answerId, d);
    case 'SKIP': {
      if (r.hostId !== e.playerId) return 'NOT_HOST';
      if (r.phase !== 'REVEAL' && r.phase !== 'SCOREBOARD') return 'BAD_PHASE';
      advanceFromTimedPhase(r, d);
      return null;
    }
    case 'PLAY_AGAIN': {
      if (r.hostId !== e.playerId) return 'NOT_HOST';
      if (r.phase !== 'GAME_OVER') return 'BAD_PHASE';
      resetToLobby(r);
      return null;
    }
    case 'TIMER_EXPIRED': {
      // Alarms can be stale (the phase may have advanced early); only act when actually due.
      if (r.phaseEndsAt === null || d.now < r.phaseEndsAt) return 'TIMER_NOT_DUE';
      advanceFromTimedPhase(r, d);
      return null;
    }
  }
}

// ---------------------------------------------------------------- players

function connectedIds(r: Room): string[] {
  return r.playerOrder.filter((id) => r.players[id]?.isConnected);
}

function join(r: Room, playerId: string, rawName: string): Outcome {
  const existing = r.players[playerId];
  if (existing) {
    existing.isConnected = true; // reconnect
    if (!r.hostId) r.hostId = playerId;
    return null;
  }
  if (r.phase !== 'LOBBY') return 'GAME_IN_PROGRESS';
  if (r.playerOrder.length >= r.config.maxPlayers) return 'ROOM_FULL';
  const name = rawName.trim().replace(/\s+/g, ' ');
  if (!name) return 'EMPTY_NAME';
  const clipped = name.slice(0, r.config.maxNameLength);
  if (r.playerOrder.some((id) => normalize(r.players[id]!.name) === normalize(clipped))) return 'NAME_TAKEN';
  r.players[playerId] = { id: playerId, name: clipped, score: 0, isConnected: true };
  r.playerOrder.push(playerId);
  if (!r.hostId) r.hostId = playerId;
  return null;
}

function disconnect(r: Room, playerId: string, d: Deps): Outcome {
  const p = r.players[playerId];
  if (!p) return 'UNKNOWN_PLAYER';
  if (r.phase === 'LOBBY') {
    delete r.players[playerId];
    r.playerOrder = r.playerOrder.filter((id) => id !== playerId);
  } else {
    p.isConnected = false;
  }
  if (r.hostId === playerId) r.hostId = connectedIds(r)[0] ?? r.hostId;
  if (!r.players[r.hostId ?? '']) r.hostId = r.playerOrder[0] ?? null;
  maybeAdvanceEarly(r, d);
  return null;
}

// ---------------------------------------------------------------- phases

function startRound(r: Room, d: Deps, round: number): void {
  const unused = d.questions.filter((q) => !r.usedQuestionIds.includes(q.id));
  const pool = unused.length ? unused : d.questions;
  const question = pool[Math.floor(d.rng() * pool.length)]!;
  r.round = round;
  r.question = question;
  r.usedQuestionIds.push(question.id);
  r.submissions = {};
  r.answers = [];
  r.votes = {};
  r.roundDeltas = {};
  r.phase = 'SUBMITTING';
  r.phaseEndsAt = d.now + r.config.submitMs;
}

function submit(r: Room, playerId: string, rawText: string, d: Deps): Outcome {
  if (r.phase !== 'SUBMITTING') return 'BAD_PHASE';
  if (!r.players[playerId]) return 'UNKNOWN_PLAYER';
  if (playerId in r.submissions) return 'ALREADY_SUBMITTED';
  const text = rawText.trim().replace(/\s+/g, ' ');
  if (!text) return 'EMPTY_ANSWER';
  if (text.length > r.config.maxAnswerLength) return 'ANSWER_TOO_LONG';
  if (normalize(text) === normalize(r.question!.realAnswer)) return 'MATCHES_REAL';
  r.submissions[playerId] = text;
  maybeAdvanceEarly(r, d);
  return null;
}

function vote(r: Room, playerId: string, answerId: string, d: Deps): Outcome {
  if (r.phase !== 'VOTING') return 'BAD_PHASE';
  if (!r.players[playerId]) return 'UNKNOWN_PLAYER';
  if (playerId in r.votes) return 'ALREADY_VOTED';
  const answer = r.answers.find((a) => a.id === answerId);
  if (!answer) return 'UNKNOWN_ANSWER';
  if (answer.authorIds.includes(playerId)) return 'OWN_ANSWER';
  r.votes[playerId] = answerId;
  maybeAdvanceEarly(r, d);
  return null;
}

/** Skip the wait once every connected player has acted. */
function maybeAdvanceEarly(r: Room, d: Deps): void {
  const ids = connectedIds(r);
  if (!ids.length) return;
  if (r.phase === 'SUBMITTING' && ids.every((id) => id in r.submissions)) toVoting(r, d);
  else if (r.phase === 'VOTING' && ids.every((id) => id in r.votes)) toReveal(r, d);
}

function advanceFromTimedPhase(r: Room, d: Deps): void {
  switch (r.phase) {
    case 'SUBMITTING':
      return toVoting(r, d);
    case 'VOTING':
      return toReveal(r, d);
    case 'REVEAL':
      r.phase = 'SCOREBOARD';
      r.phaseEndsAt = d.now + r.config.scoreboardMs;
      return;
    case 'SCOREBOARD':
      if (r.round >= r.config.totalRounds) {
        r.phase = 'GAME_OVER';
        r.phaseEndsAt = null;
      } else {
        startRound(r, d, r.round + 1);
      }
      return;
    default:
      return;
  }
}

function toVoting(r: Room, d: Deps): void {
  const real = r.question!.realAnswer;
  const taken = new Set([normalize(real), ...Object.values(r.submissions).map(normalize)]);

  // Auto-skip: fill in a funny fallback for connected players who ran out the clock.
  for (const id of connectedIds(r)) {
    if (id in r.submissions) continue;
    const options = d.fallbacks.filter((f) => !taken.has(normalize(f)));
    const pick = options.length ? options[Math.floor(d.rng() * options.length)]! : 'No comment';
    r.submissions[id] = pick;
    taken.add(normalize(pick));
  }

  // Merge identical fakes into one entry with several authors.
  const groups = new Map<string, Answer>();
  for (const id of r.playerOrder) {
    const text = r.submissions[id];
    if (text === undefined) continue;
    const key = normalize(text);
    const group = groups.get(key);
    if (group) group.authorIds.push(id);
    else groups.set(key, { id: '', text, isReal: false, authorIds: [id] });
  }
  const answers = [...groups.values(), { id: '', text: real, isReal: true, authorIds: [] }];
  shuffle(answers, d.rng);
  answers.forEach((a, i) => (a.id = `ans_${i + 1}`)); // ids assigned post-shuffle: no order leak
  r.answers = answers;

  if (answers.length < 2) return toReveal(r, d); // nobody to fool
  r.phase = 'VOTING';
  r.phaseEndsAt = d.now + r.config.voteMs;
}

function toReveal(r: Room, d: Deps): void {
  const deltas: Record<string, number> = {};
  for (const [voterId, answerId] of Object.entries(r.votes)) {
    const answer = r.answers.find((a) => a.id === answerId);
    if (!answer) continue;
    if (answer.isReal) {
      deltas[voterId] = (deltas[voterId] ?? 0) + r.config.pointsForTruth;
    } else {
      for (const author of answer.authorIds) deltas[author] = (deltas[author] ?? 0) + r.config.pointsPerFool;
    }
  }
  for (const [id, pts] of Object.entries(deltas)) {
    const p = r.players[id];
    if (p) p.score += pts;
  }
  r.roundDeltas = deltas;
  r.phase = 'REVEAL';
  r.phaseEndsAt = d.now + r.config.revealMs;
}

function resetToLobby(r: Room): void {
  for (const id of [...r.playerOrder]) {
    const p = r.players[id]!;
    if (!p.isConnected) {
      delete r.players[id];
      r.playerOrder = r.playerOrder.filter((x) => x !== id);
    } else {
      p.score = 0;
    }
  }
  if (!r.players[r.hostId ?? '']) r.hostId = r.playerOrder[0] ?? null;
  r.phase = 'LOBBY';
  r.round = 0;
  r.question = null;
  r.submissions = {};
  r.answers = [];
  r.votes = {};
  r.roundDeltas = {};
  r.phaseEndsAt = null;
  r.usedQuestionIds = [];
}

function shuffle<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}
