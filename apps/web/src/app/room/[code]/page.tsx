'use client';

import { use, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import type { RoomView } from '@hoodwink/game-core';
import { connect, disconnect } from '@/lib/connection';
import { sfx } from '@/lib/sfx';
import { useGame } from '@/lib/store';
import { GameOver, Lobby, Reveal, Scoreboard, Submitting, Voting } from '@/components/screens';

function readName(): string {
  try {
    return localStorage.getItem('hoodwink:name') ?? '';
  } catch {
    return '';
  }
}

export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const code = use(params).code.toUpperCase();
  const router = useRouter();
  const [name, setName] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const view = useGame((s) => s.view);
  const status = useGame((s) => s.status);
  const error = useGame((s) => s.error);

  useEffect(() => setName(readName()), []);

  useEffect(() => {
    if (!name) return;
    connect(code, name);
    return disconnect;
  }, [code, name]);

  // Sound is driven by server-confirmed state changes, never by optimistic clicks.
  const prev = useRef<RoomView | null>(null);
  useEffect(() => {
    const before = prev.current;
    prev.current = view;
    if (!view || !before) return; // first frame / reconnect snapshot: stay quiet
    if (view.phase !== before.phase) {
      if (view.phase === 'SUBMITTING' || view.phase === 'VOTING') sfx.whoosh();
      else if (view.phase === 'SCOREBOARD') sfx.scoreboard();
      else if (view.phase === 'GAME_OVER') sfx.fanfare();
      // REVEAL is silent here: each card plays its own flip sound.
    } else if ((before.myAnswer === null && view.myAnswer !== null) || (before.myVote === null && view.myVote !== null)) {
      sfx.lock();
    }
  }, [view]);

  useEffect(() => {
    if (error) sfx.error();
  }, [error]);

  if (name === null) return null; // reading localStorage

  if (!name) {
    return (
      <form
        className="card m-auto w-full space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            localStorage.setItem('hoodwink:name', draft.trim());
          } catch {
            /* ignore */
          }
          setName(draft.trim());
        }}
      >
        <h1 className="text-2xl font-black">Joining room {code}</h1>
        <input
          autoFocus
          value={draft}
          maxLength={20}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Your name"
          className="w-full rounded-xl bg-white/90 px-4 py-3 text-lg font-bold text-slate-900 focus:outline-none focus:ring-4 focus:ring-pink-400"
        />
        <button disabled={!draft.trim()} className="w-full rounded-2xl bg-pink-500 py-3 text-lg font-black disabled:opacity-40">
          Join
        </button>
      </form>
    );
  }

  // The join was refused (name taken, game already started, room full): nothing to render but a way out.
  if (!view && error) {
    return (
      <div className="card m-auto space-y-4 p-6 text-center">
        <p className="text-lg font-bold">{error}</p>
        <button onClick={() => router.push('/')} className="rounded-xl bg-white/20 px-5 py-2 font-bold">
          Back home
        </button>
      </div>
    );
  }

  if (!view) {
    return <p className="m-auto animate-pulse text-white/70">Connecting…</p>;
  }

  return (
    <>
      {status === 'reconnecting' && (
        <div role="status" className="fixed inset-x-0 top-0 z-50 bg-amber-400 py-1 text-center text-sm font-bold text-amber-950">
          Connection lost. Reconnecting…
        </div>
      )}
      <AnimatePresence mode="wait">
        <motion.div
          key={view.phase}
          className="flex flex-1 flex-col"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.25 }}
        >
          {view.phase === 'LOBBY' && <Lobby v={view} />}
          {view.phase === 'SUBMITTING' && <Submitting v={view} />}
          {view.phase === 'VOTING' && <Voting v={view} />}
          {view.phase === 'REVEAL' && <Reveal v={view} />}
          {view.phase === 'SCOREBOARD' && <Scoreboard v={view} />}
          {view.phase === 'GAME_OVER' && <GameOver v={view} />}
        </motion.div>
      </AnimatePresence>
    </>
  );
}
