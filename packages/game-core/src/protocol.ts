import { z } from 'zod';
import type { RejectCode } from './types';
import type { RoomView } from './view';

/** Client -> server. Validated with Zod on the server; never trust the wire. */
export const ClientMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('join'), name: z.string().min(1).max(40), token: z.string().max(100).optional() }),
  z.object({ type: z.literal('start') }),
  z.object({ type: z.literal('submit'), text: z.string().max(200) }),
  z.object({ type: z.literal('vote'), answerId: z.string().max(40) }),
  z.object({ type: z.literal('skip') }),
  z.object({ type: z.literal('playAgain') }),
  z.object({ type: z.literal('ping'), t0: z.number() }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

/** Server -> client. */
export type ServerMessage =
  | { type: 'welcome'; playerId: string; token: string }
  | { type: 'state'; seq: number; view: RoomView }
  | { type: 'pong'; t0: number; serverNow: number }
  | { type: 'error'; code: RejectCode | 'BAD_MESSAGE' | 'NOT_JOINED'; message: string };
