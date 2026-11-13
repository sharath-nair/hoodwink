# Hoodwink

A real-time multiplayer bluffing party game (think Psych! / Balderdash / Fibbage).
Everyone writes a fake answer, all answers are shuffled with the real one, and you vote for the truth.
You score for finding the truth *and* for fooling your friends.

## Architecture

```
packages/game-core   Pure TypeScript: FSM reducer, view projection, Zod protocol, clock sync. 100% unit tested.
apps/party           PartyKit (Cloudflare Durable Object) game server. One DO per room = one authoritative loop.
apps/web             Next.js (App Router) + Zustand + Framer Motion + Tailwind client.
```

### Game state machine

```
LOBBY -> SUBMITTING -> VOTING -> REVEAL -> SCOREBOARD -+-> SUBMITTING (next round)
  ^                                                    |
  +---------------- GAME_OVER <-- (last round) --------+
```

Transitions happen on the server only: early, when every connected player has acted, or when the phase alarm fires.

### Key design decisions

| Problem | Solution |
|---|---|
| **Distributed timers** | The server stores an absolute `phaseEndsAt` and sets a Durable Object alarm. Clients never advance the game. |
| **Client clock skew** | `ClockSync` does NTP-style ping/pong, takes the median offset of the lowest-RTT samples, and computes `timeLeft = phaseEndsAt - (Date.now() + offset)`. Tested with simulated skewed clients. |
| **Cheating / secrecy** | The full `Room` never leaves the server. Each player gets `viewFor(room, playerId)`: no real answer, authors or voters until `REVEAL`, and every voting option has an identical shape. |
| **Disconnects** | Presence is tracked per connection (multi-tab safe). Disconnected players don't block early-advance; stragglers get a funny auto-filled fallback when the timer hits zero; a secret token in `localStorage` reclaims your seat on reconnect; host migrates. |
| **Testability** | The reducer is pure (`reduce(room, event, deps)`), with `now`/`rng`/question bank injected. No sockets needed to test a whole game. |
| **Stale alarms** | `TIMER_EXPIRED` is a no-op unless `now >= phaseEndsAt`, so an alarm for a phase that already advanced early is harmless. |

## Run it

```bash
npm install
npm run dev        # PartyKit on :1999, Next.js on :3000
npm test           # game-core unit tests
npm run typecheck
```

Open http://localhost:3000 in three tabs (or phones on your LAN, set `NEXT_PUBLIC_PARTYKIT_HOST`), create a room, join with the code and play.

## Roadmap

- [x] Sound effects: synthesized WebAudio (`apps/web/src/lib/sfx.ts`), unlocked on first tap, muted in hidden tabs, persisted mute toggle
- [ ] Jackbox-style `/host` big-screen view, with phones as controllers
- [ ] Playwright multi-context E2E (4 players, full game, simulated latency)
- [ ] Larger / themed question packs, optional LLM-generated prompts with curated fallback
- [ ] Deploy: `partykit deploy` + Vercel
