import type { Config } from './config';
import type { Phase, Room } from './types';

export interface PlayerView {
  id: string;
  name: string;
  score: number;
  isConnected: boolean;
  isHost: boolean;
}

export interface AnswerView {
  id: string;
  text: string;
  isMine: boolean;
  /** null until REVEAL. This is the only place authorship ever reaches a client. */
  reveal: null | { isReal: boolean; authorIds: string[]; voterIds: string[] };
}

/** What every spectator (the big-screen host display) may see: the room as seen by "nobody in particular". */
export interface PublicRoomView {
  code: string;
  phase: Phase;
  round: number;
  totalRounds: number;
  hostId: string | null;
  players: PlayerView[];
  prompt: string | null;
  /** Absolute SERVER epoch ms. Clients must correct for clock offset (see ClockSync). */
  phaseEndsAt: number | null;
  phaseDurationMs: number | null;
  submitted: string[];
  voted: string[];
  answers: AnswerView[];
  realAnswer: string | null;
  roundDeltas: Record<string, number>;
}

/** A player's view: the public view plus their own private state. */
export interface RoomView extends PublicRoomView {
  you: string;
  canStart: boolean;
  myAnswer: string | null;
  myVote: string | null;
}

export function phaseDuration(phase: Phase, c: Config): number | null {
  switch (phase) {
    case 'SUBMITTING':
      return c.submitMs;
    case 'VOTING':
      return c.voteMs;
    case 'REVEAL':
      return c.revealMs;
    case 'SCOREBOARD':
      return c.scoreboardMs;
    default:
      return null;
  }
}

/**
 * Shared projection. `viewerId` is null for spectators, who own no answers.
 * - `realAnswer` is withheld until REVEAL.
 * - Answer authors and voters are withheld until REVEAL.
 */
function project(room: Room, viewerId: string | null): PublicRoomView {
  const revealed = room.phase === 'REVEAL' || room.phase === 'SCOREBOARD' || room.phase === 'GAME_OVER';
  const inRound = room.phase !== 'LOBBY';
  const showAnswers = room.phase === 'VOTING' || revealed;

  const answers: AnswerView[] = showAnswers
    ? room.answers.map((a) => ({
        id: a.id,
        text: a.text,
        isMine: viewerId !== null && a.authorIds.includes(viewerId),
        reveal: revealed
          ? {
              isReal: a.isReal,
              authorIds: [...a.authorIds],
              voterIds: Object.entries(room.votes)
                .filter(([, answerId]) => answerId === a.id)
                .map(([voterId]) => voterId),
            }
          : null,
      }))
    : [];

  return {
    code: room.code,
    phase: room.phase,
    round: room.round,
    totalRounds: room.config.totalRounds,
    hostId: room.hostId,
    players: room.playerOrder.map((id) => {
      const p = room.players[id]!;
      return { id, name: p.name, score: p.score, isConnected: p.isConnected, isHost: id === room.hostId };
    }),
    prompt: inRound ? (room.question?.prompt ?? null) : null,
    phaseEndsAt: room.phaseEndsAt,
    phaseDurationMs: phaseDuration(room.phase, room.config),
    // Who has finished is public. WHAT they wrote or chose is not.
    submitted: Object.keys(room.submissions),
    voted: Object.keys(room.votes),
    answers,
    realAnswer: revealed ? (room.question?.realAnswer ?? null) : null,
    roundDeltas: revealed ? { ...room.roundDeltas } : {},
  };
}

/** Sanitized projection of the room for ONE player. During SUBMITTING they see only their own text. */
export function viewFor(room: Room, playerId: string): RoomView {
  return {
    ...project(room, playerId),
    you: playerId,
    canStart:
      room.phase === 'LOBBY' &&
      room.playerOrder.filter((id) => room.players[id]?.isConnected).length >= room.config.minPlayers,
    myAnswer: room.submissions[playerId] ?? null,
    myVote: room.votes[playerId] ?? null,
  };
}

/** Projection for the big-screen host display. Contains no player's private state. */
export function publicViewFor(room: Room): PublicRoomView {
  return project(room, null);
}
