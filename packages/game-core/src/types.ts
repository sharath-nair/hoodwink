import type { Config } from './config';

/**
 * LOBBY -> SUBMITTING -> VOTING -> REVEAL -> SCOREBOARD -+-> SUBMITTING (next round)
 *   ^                                                    |
 *   +---------- GAME_OVER <------ (last round) ----------+
 */
export type Phase = 'LOBBY' | 'SUBMITTING' | 'VOTING' | 'REVEAL' | 'SCOREBOARD' | 'GAME_OVER';

export interface Player {
  id: string;
  name: string;
  score: number;
  isConnected: boolean;
}

export interface Question {
  id: string;
  prompt: string;
  realAnswer: string;
}

/** One entry on the voting screen. Identical fakes are merged, so a fake can have several authors. */
export interface Answer {
  id: string;
  text: string;
  isReal: boolean;
  authorIds: string[];
}

/**
 * Full, authoritative room state. It lives ONLY on the server.
 * Clients receive a per-player projection (see `viewFor`) so secrets never leave the server.
 */
export interface Room {
  code: string;
  phase: Phase;
  hostId: string | null;
  round: number;
  config: Config;
  players: Record<string, Player>;
  playerOrder: string[];
  question: Question | null;
  /** playerId -> fake answer text */
  submissions: Record<string, string>;
  /** Shuffled answers; populated when VOTING starts. */
  answers: Answer[];
  /** voterId -> answerId */
  votes: Record<string, string>;
  /** Points awarded this round (populated at REVEAL). */
  roundDeltas: Record<string, number>;
  /** Absolute server epoch ms at which the current phase ends. */
  phaseEndsAt: number | null;
  usedQuestionIds: string[];
}

export type RejectCode =
  | 'NOT_HOST'
  | 'BAD_PHASE'
  | 'TOO_FEW_PLAYERS'
  | 'ROOM_FULL'
  | 'GAME_IN_PROGRESS'
  | 'EMPTY_NAME'
  | 'NAME_TAKEN'
  | 'UNKNOWN_PLAYER'
  | 'EMPTY_ANSWER'
  | 'ANSWER_TOO_LONG'
  | 'MATCHES_REAL'
  | 'ALREADY_SUBMITTED'
  | 'UNKNOWN_ANSWER'
  | 'OWN_ANSWER'
  | 'ALREADY_VOTED'
  | 'TIMER_NOT_DUE';

export interface ReduceResult {
  room: Room;
  rejected?: RejectCode;
}
