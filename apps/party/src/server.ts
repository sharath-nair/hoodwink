import type * as Party from 'partykit/server';
import {
  ClientMessage,
  FALLBACK_ANSWERS,
  QUESTION_BANK,
  createRoom,
  reduce,
  viewFor,
  type Deps,
  type GameEvent,
  type RejectCode,
  type Room,
  type ServerMessage,
} from '@hoodwink/game-core';

interface Persisted {
  room: Room;
  /** secret reconnect token -> playerId. Tokens are never sent to other players. */
  tokens: Record<string, string>;
}

interface ConnState {
  playerId: string | null;
}

/**
 * One Durable Object per room code = one authoritative game loop.
 * It owns the Room state, validates every message, advances phases on an alarm,
 * and broadcasts a *per-player sanitized view* after each transition.
 */
export default class HoodwinkServer implements Party.Server {
  private game: Room;
  private tokens: Record<string, string> = {};
  private seq = 0;

  constructor(readonly party: Party.Room) {
    this.game = createRoom(party.id.toUpperCase());
  }

  async onStart() {
    const saved = await this.party.storage.get<Persisted>('state');
    if (saved) {
      this.game = saved.room;
      this.tokens = saved.tokens;
      await this.scheduleAlarm();
    }
  }

  onConnect(conn: Party.Connection<ConnState>) {
    conn.setState({ playerId: null });
  }

  async onMessage(raw: string, sender: Party.Connection<ConnState>) {
    let msg: ClientMessage;
    try {
      msg = ClientMessage.parse(JSON.parse(raw));
    } catch {
      return this.sendError(sender, 'BAD_MESSAGE', 'Malformed message');
    }

    if (msg.type === 'ping') {
      return this.send(sender, { type: 'pong', t0: msg.t0, serverNow: Date.now() });
    }

    if (msg.type === 'join') {
      const knownId = msg.token ? this.tokens[msg.token] : undefined;
      const playerId = knownId ?? crypto.randomUUID();
      const token = knownId ? msg.token! : crypto.randomUUID();
      const rejected = await this.dispatch({ type: 'JOIN', playerId, name: msg.name });
      if (rejected) return this.sendError(sender, rejected, `Cannot join: ${rejected}`);
      if (!knownId) this.tokens[token] = playerId;
      sender.setState({ playerId });
      await this.persist();
      this.send(sender, { type: 'welcome', playerId, token });
      return this.broadcast();
    }

    const playerId = sender.state?.playerId;
    if (!playerId) return this.sendError(sender, 'NOT_JOINED', 'Join the room first');

    const event: GameEvent =
      msg.type === 'start'
        ? { type: 'START_GAME', playerId }
        : msg.type === 'submit'
          ? { type: 'SUBMIT', playerId, text: msg.text }
          : msg.type === 'vote'
            ? { type: 'VOTE', playerId, answerId: msg.answerId }
            : msg.type === 'skip'
              ? { type: 'SKIP', playerId }
              : { type: 'PLAY_AGAIN', playerId };

    const rejected = await this.dispatch(event);
    if (rejected) this.sendError(sender, rejected, `Rejected: ${rejected}`);
  }

  async onClose(conn: Party.Connection<ConnState>) {
    const playerId = conn.state?.playerId;
    if (!playerId) return;
    // A player with a second tab/socket open is still connected.
    for (const other of this.party.getConnections<ConnState>()) {
      if (other.id !== conn.id && other.state?.playerId === playerId) return;
    }
    await this.dispatch({ type: 'DISCONNECT', playerId });
  }

  /** Phase deadlines are enforced here, server-side. Clients never advance the game themselves. */
  async onAlarm() {
    await this.dispatch({ type: 'TIMER_EXPIRED' });
  }

  // ------------------------------------------------------------------

  /** Apply an event; on success persist, re-arm the alarm and broadcast. Returns a reject code or null. */
  private async dispatch(event: GameEvent): Promise<RejectCode | null> {
    const { room, rejected } = reduce(this.game, event, this.deps());
    if (rejected) return rejected;
    this.game = room;
    await this.persist();
    await this.scheduleAlarm();
    this.broadcast();
    return null;
  }

  private deps(): Deps {
    return { now: Date.now(), rng: Math.random, questions: QUESTION_BANK, fallbacks: FALLBACK_ANSWERS };
  }

  private async persist() {
    await this.party.storage.put<Persisted>('state', { room: this.game, tokens: this.tokens });
  }

  private async scheduleAlarm() {
    if (this.game.phaseEndsAt !== null) await this.party.storage.setAlarm(this.game.phaseEndsAt);
    else await this.party.storage.deleteAlarm();
  }

  private broadcast() {
    this.seq++;
    for (const conn of this.party.getConnections<ConnState>()) {
      const playerId = conn.state?.playerId;
      if (playerId) this.send(conn, { type: 'state', seq: this.seq, view: viewFor(this.game, playerId) });
    }
  }

  private send(conn: Party.Connection, msg: ServerMessage) {
    conn.send(JSON.stringify(msg));
  }

  private sendError(conn: Party.Connection, code: Extract<ServerMessage, { type: 'error' }>['code'], message: string) {
    this.send(conn, { type: 'error', code, message });
  }
}

HoodwinkServer satisfies Party.Worker;
