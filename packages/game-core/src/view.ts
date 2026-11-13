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

export interface RoomView {
  code: string;
  phase: Phase;
  round: number;
  totalRounds: number;
  you: string;
  hostId: string | null;
  canStart: boolean;
  players: PlayerView[];
  prompt: string | null;
  /** Absolute SERVER epoch ms. Clients must correct for clock offset (see ClockSync). */
  phaseEndsAt: number | null;
  phaseDurationMs: number | null;
  submitted: string[];
  voted: string[];
  myAnswer: string | null;
  myVote: string | null;
  answers: AnswerView[];
  realAnswer: string | null;
  roundDeltas: Record<string, number>;
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
 * Sanitized projection of the room for ONE player.
 * - `realAnswer` is withheld until REVEAL.
 * - Answer authors and voters are withheld until REVEAL.
 * - During SUBMITTING a player only sees their own text.
 */
export function viewFor(room: Room, playerId: string): RoomView {
  const revealed = room.phase === 'REVEAL' || room.phase === 'SCOREBOARD' || room.phase === 'GAME_OVER';
  const inRound = room.phase !== 'LOBBY';
  const showAnswers = room.phase === 'VOTING' || revealed;

  const answers: AnswerView[] = showAnswers
    ? room.answers.map((a) => ({
        id: a.id,
        text: a.text,
        isMine: a.authorIds.includes(playerId),
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
    you: playerId,
    hostId: room.hostId,
    canStart:
      room.phase === 'LOBBY' &&
      room.playerOrder.filter((id) => room.players[id]?.isConnected).length >= room.config.minPlayers,
    players: room.playerOrder.map((id) => {
      const p = room.players[id]!;
      return { id, name: p.name, score: p.score, isConnected: p.isConnected, isHost: id === room.hostId };
    }),
    prompt: inRound ? (room.question?.prompt ?? null) : null,
    phaseEndsAt: room.phaseEndsAt,
    phaseDurationMs: phaseDuration(room.phase, room.config),
    submitted: Object.keys(room.submissions),
    voted: Object.keys(room.votes),
    myAnswer: room.submissions[playerId] ?? null,
    myVote: room.votes[playerId] ?? null,
    answers,
    realAnswer: revealed ? (room.question?.realAnswer ?? null) : null,
    roundDeltas: revealed ? { ...room.roundDeltas } : {},
  };
}
