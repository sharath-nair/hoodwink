import PartySocket from 'partysocket';
import { ClockSync, type ClientMessage, type ServerMessage } from '@hoodwink/game-core';
import { friendlyError, useGame } from './store';

/** Shared clock estimator: converts server deadlines into local time-left. */
export const clock = new ClockSync();

const HOST = process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? 'localhost:1999';
const tokenKey = (code: string) => `hoodwink:token:${code}`;

let socket: PartySocket | null = null;
let pingTimer: ReturnType<typeof setTimeout> | null = null;

function safeStorage<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

export function send(msg: ClientMessage) {
  socket?.send(JSON.stringify(msg));
}

function schedulePing(n = 0) {
  send({ type: 'ping', t0: Date.now() });
  // Burst early so the offset converges fast, then settle to a slow heartbeat.
  pingTimer = setTimeout(() => schedulePing(n + 1), n < 5 ? 500 : 10_000);
}

export function connect(code: string, name: string) {
  disconnect();
  useGame.setState({ status: 'connecting', error: null, view: null, seq: 0 });
  const ws = new PartySocket({ host: HOST, room: code });
  socket = ws;
  let hasOpened = false;

  ws.addEventListener('open', () => {
    // First open and every auto-reconnect: re-join with our secret token to reclaim our seat.
    const token = safeStorage(() => localStorage.getItem(tokenKey(code))) ?? undefined;
    send({ type: 'join', name, token });
    useGame.setState({ status: 'open' });
    if (pingTimer) clearTimeout(pingTimer);
    schedulePing();
    hasOpened = true;
  });

  ws.addEventListener('close', () => {
    if (pingTimer) clearTimeout(pingTimer);
    useGame.setState({ status: hasOpened ? 'reconnecting' : 'connecting' });
  });

  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data as string) as ServerMessage;
    switch (msg.type) {
      case 'welcome':
        safeStorage(() => localStorage.setItem(tokenKey(code), msg.token));
        break;
      case 'state':
        // Drop out-of-order frames.
        if (msg.seq >= useGame.getState().seq) useGame.setState({ view: msg.view, seq: msg.seq, error: null });
        break;
      case 'pong':
        clock.addSample(msg.t0, msg.serverNow);
        break;
      case 'error':
        useGame.setState({ error: friendlyError(msg.code, msg.message) });
        break;
    }
  });
}

export function disconnect() {
  if (pingTimer) clearTimeout(pingTimer);
  socket?.close();
  socket = null;
}
