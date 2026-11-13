'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { RoomView } from '@hoodwink/game-core';
import { send } from '@/lib/connection';
import { sfx } from '@/lib/sfx';
import { useGame } from '@/lib/store';
import { TimerBar } from './TimerBar';

const nameOf = (v: RoomView, id: string) => v.players.find((p) => p.id === id)?.name ?? '???';

function Header({ v }: { v: RoomView }) {
  return (
    <header className="mb-4 space-y-3">
      <div className="flex items-center justify-between text-sm font-semibold uppercase tracking-widest text-white/70">
        <span>Round {v.round} / {v.totalRounds}</span>
        <span>Room {v.code}</span>
      </div>
      {v.phaseEndsAt !== null && v.phaseDurationMs !== null && (
        <TimerBar
          endsAt={v.phaseEndsAt}
          durationMs={v.phaseDurationMs}
          tick={v.phase === 'SUBMITTING' || v.phase === 'VOTING'}
        />
      )}
    </header>
  );
}

function Prompt({ text }: { text: string | null }) {
  return (
    <motion.h2
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="card mb-5 p-5 text-center text-2xl font-extrabold leading-snug"
    >
      {text}
    </motion.h2>
  );
}

function ErrorLine() {
  const error = useGame((s) => s.error);
  return <p className="h-5 text-center text-sm text-rose-300" role="alert">{error}</p>;
}

function PlayerChips({ v, done }: { v: RoomView; done: string[] }) {
  return (
    <ul className="flex flex-wrap justify-center gap-2">
      {v.players.map((p) => (
        <li
          key={p.id}
          className={`rounded-full px-3 py-1 text-sm font-semibold transition-colors ${
            done.includes(p.id) ? 'bg-emerald-400 text-emerald-950' : 'bg-white/15'
          } ${p.isConnected ? '' : 'opacity-40'}`}
        >
          {p.name}
          {done.includes(p.id) ? ' ✓' : ''}
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ LOBBY

export function Lobby({ v }: { v: RoomView }) {
  const isHost = v.hostId === v.you;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="card p-6 text-center">
        <p className="text-sm uppercase tracking-widest text-white/70">Room code</p>
        <p className="my-2 text-6xl font-black tracking-[0.3em]">{v.code}</p>
        <button onClick={copy} className="text-sm font-semibold text-pink-300 underline underline-offset-4">
          {copied ? 'Link copied!' : 'Copy invite link'}
        </button>
      </div>
      <ul className="space-y-2">
        <AnimatePresence>
          {v.players.map((p) => (
            <motion.li
              key={p.id}
              layout
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="card flex items-center justify-between px-4 py-3 font-bold"
            >
              <span>{p.name}{p.id === v.you ? ' (you)' : ''}</span>
              {p.isHost && <span className="text-xs uppercase tracking-widest text-yellow-300">Host</span>}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <div className="mt-auto space-y-2">
        <ErrorLine />
        {isHost ? (
          <button
            disabled={!v.canStart}
            onClick={() => send({ type: 'start' })}
            className="w-full rounded-2xl bg-pink-500 py-4 text-xl font-black shadow-lg transition active:scale-95 disabled:opacity-40"
          >
            {v.canStart ? 'Start game' : 'Need 3+ players'}
          </button>
        ) : (
          <p className="text-center text-white/70">Waiting for the host to start…</p>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ SUBMITTING

export function Submitting({ v }: { v: RoomView }) {
  const [text, setText] = useState('');
  const locked = v.myAnswer !== null;
  return (
    <div className="flex flex-1 flex-col">
      <Header v={v} />
      <Prompt text={v.prompt} />
      {locked ? (
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="card mb-5 p-5 text-center">
          <p className="text-sm uppercase tracking-widest text-white/70">Your lie</p>
          <p className="mt-1 text-2xl font-bold">“{v.myAnswer}”</p>
        </motion.div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            send({ type: 'submit', text });
          }}
        >
          <input
            autoFocus
            value={text}
            maxLength={60}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write something believable…"
            className="w-full rounded-2xl bg-white/90 px-4 py-4 text-lg font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-pink-400"
          />
          <ErrorLine />
          <button
            disabled={!text.trim()}
            className="w-full rounded-2xl bg-pink-500 py-4 text-xl font-black transition active:scale-95 disabled:opacity-40"
          >
            Lock it in
          </button>
        </form>
      )}
      <div className="mt-auto pt-6">
        <PlayerChips v={v} done={v.submitted} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ VOTING

export function Voting({ v }: { v: RoomView }) {
  const voted = v.myVote !== null;
  return (
    <div className="flex flex-1 flex-col">
      <Header v={v} />
      <Prompt text={v.prompt} />
      <ul className="space-y-3">
        {v.answers.map((a, i) => {
          const picked = v.myVote === a.id;
          return (
            <motion.li key={a.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}>
              <button
                disabled={voted || a.isMine}
                onClick={() => send({ type: 'vote', answerId: a.id })}
                className={`w-full rounded-2xl px-4 py-4 text-left text-lg font-bold transition active:scale-[0.98] ${
                  picked ? 'bg-emerald-400 text-emerald-950' : 'card hover:bg-white/20'
                } ${a.isMine ? 'opacity-40' : ''} ${voted && !picked ? 'opacity-60' : ''}`}
              >
                {a.text}
                {a.isMine && <span className="ml-2 text-xs uppercase tracking-widest">(yours)</span>}
              </button>
            </motion.li>
          );
        })}
      </ul>
      <ErrorLine />
      <div className="mt-auto pt-4">
        <PlayerChips v={v} done={v.voted} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ REVEAL

function FlipCard({ delay, real, front, back }: { delay: number; real: boolean; front: React.ReactNode; back: React.ReactNode }) {
  const [flipped, setFlipped] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setFlipped(true);
      if (real) sfx.flipTruth();
      else sfx.flipFake();
    }, delay * 1000);
    return () => clearTimeout(t);
  }, [delay, real]);
  const face = { backfaceVisibility: 'hidden' as const };
  return (
    <div style={{ perspective: 1000 }}>
      <motion.div
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.6, type: 'spring', stiffness: 120, damping: 16 }}
        style={{ transformStyle: 'preserve-3d', position: 'relative' }}
      >
        <div style={face}>{front}</div>
        <div style={{ ...face, transform: 'rotateY(180deg)', position: 'absolute', inset: 0 }}>{back}</div>
      </motion.div>
    </div>
  );
}

export function Reveal({ v }: { v: RoomView }) {
  const isHost = v.hostId === v.you;
  // Reveal fakes first, the real answer last for drama.
  const ordered = [...v.answers].sort((a, b) => Number(a.reveal?.isReal) - Number(b.reveal?.isReal));
  return (
    <div className="flex flex-1 flex-col">
      <Header v={v} />
      <Prompt text={v.prompt} />
      <ul className="space-y-3">
        {ordered.map((a, i) => {
          const r = a.reveal!;
          const delay = 0.4 + i * 1.1;
          const back = (
            <div className={`rounded-2xl p-4 ${r.isReal ? 'bg-emerald-400 text-emerald-950' : 'card'}`}>
              <p className="text-lg font-black">
                {r.isReal ? '✓ ' : ''}
                {a.text}
              </p>
              <p className="mt-1 text-sm font-semibold opacity-80">
                {r.isReal ? 'The truth' : `Written by ${r.authorIds.map((id) => nameOf(v, id)).join(' & ')}`}
              </p>
              {r.voterIds.length > 0 && (
                <p className="mt-1 text-sm font-bold">
                  {r.isReal ? 'Found by' : 'Fooled'}: {r.voterIds.map((id) => nameOf(v, id)).join(', ')}
                </p>
              )}
            </div>
          );
          const front = (
            <div className="card p-4 text-lg font-bold">
              {a.text}
            </div>
          );
          return (
            <li key={a.id}>
              <FlipCard delay={delay} real={r.isReal} front={front} back={back} />
            </li>
          );
        })}
      </ul>
      {isHost && (
        <button onClick={() => send({ type: 'skip' })} className="mt-auto pt-6 text-sm font-semibold text-white/60 underline">
          Skip ▸
        </button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ SCOREBOARD / GAME OVER

function Ranking({ v }: { v: RoomView }) {
  const ranked = [...v.players].sort((a, b) => b.score - a.score);
  return (
    <ul className="space-y-2">
      {ranked.map((p, i) => (
        <motion.li
          key={p.id}
          layout
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className={`card flex items-center gap-3 px-4 py-3 ${p.id === v.you ? 'ring-2 ring-pink-400' : ''}`}
        >
          <span className="w-6 text-lg font-black text-white/60">{i + 1}</span>
          <span className="flex-1 font-bold">{p.name}</span>
          {v.roundDeltas[p.id] ? (
            <motion.span initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-sm font-black text-emerald-300">
              +{v.roundDeltas[p.id]}
            </motion.span>
          ) : null}
          <span className="w-16 text-right text-xl font-black tabular-nums">{p.score}</span>
        </motion.li>
      ))}
    </ul>
  );
}

export function Scoreboard({ v }: { v: RoomView }) {
  const isHost = v.hostId === v.you;
  return (
    <div className="flex flex-1 flex-col">
      <Header v={v} />
      <h2 className="mb-4 text-center text-3xl font-black">Scoreboard</h2>
      <Ranking v={v} />
      {isHost && (
        <button onClick={() => send({ type: 'skip' })} className="mt-auto pt-6 text-sm font-semibold text-white/60 underline">
          Next round ▸
        </button>
      )}
    </div>
  );
}

export function GameOver({ v }: { v: RoomView }) {
  const isHost = v.hostId === v.you;
  const winner = [...v.players].sort((a, b) => b.score - a.score)[0];
  return (
    <div className="flex flex-1 flex-col">
      <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring' }} className="mb-6 text-center">
        <p className="text-sm uppercase tracking-widest text-white/70">Master hoodwinker</p>
        <p className="text-5xl font-black text-yellow-300">🏆 {winner?.name}</p>
      </motion.div>
      <Ranking v={{ ...v, roundDeltas: {} }} />
      <div className="mt-auto pt-6">
        {isHost ? (
          <button
            onClick={() => send({ type: 'playAgain' })}
            className="w-full rounded-2xl bg-pink-500 py-4 text-xl font-black transition active:scale-95"
          >
            Play again
          </button>
        ) : (
          <p className="text-center text-white/70">Waiting for the host…</p>
        )}
      </div>
    </div>
  );
}
