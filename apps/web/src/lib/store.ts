import { create } from 'zustand';
import type { RoomView } from '@hoodwink/game-core';

export type ConnStatus = 'idle' | 'connecting' | 'open' | 'reconnecting';

interface GameStore {
  status: ConnStatus;
  /** Latest sanitized view from the server. The client never holds secrets or derives game state. */
  view: RoomView | null;
  seq: number;
  error: string | null;
}

/** Zustand just mirrors what the server tells us; the server is the single source of truth. */
export const useGame = create<GameStore>(() => ({
  status: 'idle',
  view: null,
  seq: 0,
  error: null,
}));

const ERRORS: Record<string, string> = {
  MATCHES_REAL: "Too close to the real answer. Get creative!",
  NAME_TAKEN: 'Someone already took that name.',
  GAME_IN_PROGRESS: 'That game has already started.',
  ROOM_FULL: 'That room is full.',
  TOO_FEW_PLAYERS: 'You need at least 3 players.',
  ANSWER_TOO_LONG: 'Keep it shorter.',
  EMPTY_ANSWER: 'Write something first.',
  OWN_ANSWER: "You can't vote for your own answer.",
};

export function friendlyError(code: string, fallback: string): string {
  return ERRORS[code] ?? fallback;
}
