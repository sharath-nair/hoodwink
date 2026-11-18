'use client';

import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import type { PublicRoomView } from '@hoodwink/game-core';
import { FlipCard, Ranking } from './screens';
import { TimerBar } from './TimerBar';

type V = PublicRoomView;
const nameOf = (v: V, id: string) => v.players.find((p) => p.id === id)?.name ?? '???';

function HostHeader({ v }: { v: V }) {
  return (
    <header className="mb-8 space-y-4">
      {/* pr-14 keeps the label clear of the fixed mute button in the top-right corner */}
      <div className="flex items-center justify-between pr-14 text-2xl font-bold uppercase tracking-[0.25em] text-white/70">
        <span>
          Round {v.round} / {v.totalRounds}
        </span>
        <span>Room {v.code}</span>
      </div>
      {v.phaseEndsAt !== null && v.phaseDurationMs !== null && (
        <TimerBar
          large
          endsAt={v.phaseEndsAt}
          durationMs={v.phaseDurationMs}
          tick={v.phase === 'SUBMITTING' || v.phase === 'VOTING'}
        />
      )}
    </header>
  );
}

function BigPrompt({ text }: { text: string | null }) {
  return (
    <motion.h2
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="card mb-10 px-10 py-8 text-center text-5xl font-extrabold leading-tight"
    >
      {text}
    </motion.h2>
  );
}

/** Players as big chips; ticked once they've acted. Disconnected players fade. */
function StatusChips({ v, done }: { v: V; done: string[] }) {
  return (
    <ul className="flex flex-wrap justify-center gap-4">
      {v.players.map((p) => (
        <motion.li
          key={p.id}
          layout
          className={`rounded-full px-6 py-3 text-2xl font-bold transition-colors ${
            done.includes(p.id) ? 'bg-emerald-400 text-emerald-950' : 'bg-white/15'
          } ${p.isConnected ? '' : 'opacity-40'}`}
        >
          {p.name}
          {done.includes(p.id) ? ' ✓' : ''}
        </motion.li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ LOBBY

export function HostLobby({ v, joinUrl }: { v: V; joinUrl: string | null }) {
  const display = joinUrl?.replace(/^https?:\/\//, '') ?? '';
  const isLocal = /^(localhost|127\.)/.test(display);
  return (
    <div className="grid flex-1 grid-cols-1 items-center gap-12 lg:grid-cols-2">
      <div className="space-y-6 text-center">
        <p className="text-3xl font-bold uppercase tracking-[0.3em] text-white/70">Join at</p>
        <p className="break-all text-4xl font-black">{display || '…'}</p>
        <p className="text-3xl font-bold uppercase tracking-[0.3em] text-white/70">Room code</p>
        <p className="text-[clamp(3.5rem,10vw,9rem)] font-black leading-none tracking-[0.15em]">{v.code}</p>
        {joinUrl && (
          <div className="mx-auto w-fit rounded-3xl bg-white p-4 shadow-2xl">
            <QRCodeSVG value={joinUrl} size={220} bgColor="#ffffff" fgColor="#120b2e" marginSize={0} />
          </div>
        )}
        {isLocal && (
          <p className="text-lg text-amber-300">
            Phones can't reach “localhost”. Open this screen via your LAN address, or set NEXT_PUBLIC_JOIN_ORIGIN.
          </p>
        )}
      </div>

      <div>
        <h2 className="mb-6 text-center text-4xl font-black">
          {v.players.length === 0 ? 'Waiting for players…' : `${v.players.length} in the room`}
        </h2>
        <ul className="grid grid-cols-2 gap-4">
          {v.players.map((p) => (
            <motion.li
              key={p.id}
              layout
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="card truncate px-6 py-5 text-center text-3xl font-black"
            >
              {p.name}
              {p.isHost && <span className="ml-2 text-sm uppercase tracking-widest text-yellow-300">Host</span>}
            </motion.li>
          ))}
        </ul>
        <p className="mt-8 text-center text-2xl text-white/70">
          {v.players.length >= 3 ? 'The host starts the game from their phone.' : 'You need at least 3 players.'}
        </p>
        <p className="mt-2 text-center text-sm text-white/40">Click anywhere on this screen once to enable sound.</p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ SUBMITTING

export function HostSubmitting({ v }: { v: V }) {
  return (
    <div className="flex flex-1 flex-col">
      <HostHeader v={v} />
      <BigPrompt text={v.prompt} />
      <p className="mb-6 text-center text-3xl font-bold text-white/80">Write your best lie on your phone</p>
      <div className="mt-auto pb-4">
        <StatusChips v={v} done={v.submitted} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ VOTING

export function HostVoting({ v }: { v: V }) {
  return (
    <div className="flex flex-1 flex-col">
      <HostHeader v={v} />
      <BigPrompt text={v.prompt} />
      <ul className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {v.answers.map((a, i) => (
          <motion.li
            key={a.id}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="card px-8 py-7 text-4xl font-black"
          >
            {a.text}
          </motion.li>
        ))}
      </ul>
      <div className="mt-auto pt-8">
        <p className="mb-4 text-center text-2xl font-bold text-white/70">Vote for the truth on your phone</p>
        <StatusChips v={v} done={v.voted} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ REVEAL

export function HostReveal({ v }: { v: V }) {
  // Fakes first, the truth last for drama.
  const ordered = [...v.answers].sort((a, b) => Number(a.reveal?.isReal) - Number(b.reveal?.isReal));
  return (
    <div className="flex flex-1 flex-col">
      <HostHeader v={v} />
      <BigPrompt text={v.prompt} />
      <ul className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {ordered.map((a, i) => {
          const r = a.reveal!;
          const back = (
            <div className={`h-full rounded-2xl px-8 py-6 ${r.isReal ? 'bg-emerald-400 text-emerald-950' : 'card'}`}>
              <p className="text-4xl font-black">
                {r.isReal ? '✓ ' : ''}
                {a.text}
              </p>
              <p className="mt-2 text-2xl font-bold opacity-80">
                {r.isReal ? 'The truth' : `Written by ${r.authorIds.map((id) => nameOf(v, id)).join(' & ')}`}
              </p>
              {r.voterIds.length > 0 && (
                <p className="mt-2 text-2xl font-black">
                  {r.isReal ? 'Found by' : 'Fooled'}: {r.voterIds.map((id) => nameOf(v, id)).join(', ')}
                </p>
              )}
            </div>
          );
          const front = <div className="card h-full px-8 py-7 text-4xl font-black">{a.text}</div>;
          return (
            <li key={a.id}>
              <FlipCard delay={0.5 + i * 1.3} real={r.isReal} front={front} back={back} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ SCOREBOARD / GAME OVER

export function HostScoreboard({ v }: { v: V }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
      <HostHeader v={v} />
      <h2 className="mb-8 text-center text-6xl font-black">Scoreboard</h2>
      <Ranking v={v} big />
    </div>
  );
}

export function HostGameOver({ v }: { v: V }) {
  const winner = [...v.players].sort((a, b) => b.score - a.score)[0];
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
      <motion.div
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 150, damping: 12 }}
        className="mb-10 text-center"
      >
        <p className="text-3xl font-bold uppercase tracking-[0.3em] text-white/70">Master hoodwinker</p>
        <p className="mt-2 text-8xl font-black text-yellow-300">🏆 {winner?.name}</p>
      </motion.div>
      <Ranking v={{ players: v.players, roundDeltas: {} }} big />
      <p className="mt-10 text-center text-2xl text-white/70">The host can start a new game from their phone.</p>
    </div>
  );
}
