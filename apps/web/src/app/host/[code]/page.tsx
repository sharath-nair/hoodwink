'use client';

import { use, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { PublicRoomView } from '@hoodwink/game-core';
import { disconnect, watch } from '@/lib/connection';
import { joinOrigin } from '@/lib/room-code';
import { sfx } from '@/lib/sfx';
import { useGame } from '@/lib/store';
import {
  HostGameOver,
  HostLobby,
  HostReveal,
  HostScoreboard,
  HostSubmitting,
  HostVoting,
} from '@/components/host-screens';

/**
 * Big-screen display (TV / laptop). Connects as a read-only spectator:
 * it receives the public view and has no way to act on the game. Phones are the controllers.
 */
export default function HostPage({ params }: { params: Promise<{ code: string }> }) {
  const code = use(params).code.toUpperCase();
  const v = useGame((s) => s.publicView);
  const status = useGame((s) => s.status);
  const [joinUrl, setJoinUrl] = useState<string | null>(null);

  useEffect(() => setJoinUrl(`${joinOrigin()}/room/${code}`), [code]);

  useEffect(() => {
    watch(code);
    return disconnect;
  }, [code]);

  // Phase stingers, driven by server state. Reveal cards play their own flip sounds.
  const prev = useRef<PublicRoomView | null>(null);
  useEffect(() => {
    const before = prev.current;
    prev.current = v;
    if (!v || !before || v.phase === before.phase) return;
    if (v.phase === 'SUBMITTING' || v.phase === 'VOTING') sfx.whoosh();
    else if (v.phase === 'SCOREBOARD') sfx.scoreboard();
    else if (v.phase === 'GAME_OVER') sfx.fanfare();
  }, [v]);

  return (
    // Full-bleed layer: escapes the phone-width <main> in the root layout.
    <div className="fixed inset-0 z-20 overflow-y-auto">
      {status === 'reconnecting' && (
        <div role="status" className="fixed inset-x-0 top-0 z-50 bg-amber-400 py-1 text-center text-lg font-bold text-amber-950">
          Connection lost. Reconnecting…
        </div>
      )}
      <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col px-10 py-8">
        {!v ? (
          <p className="m-auto animate-pulse text-3xl text-white/70">Connecting…</p>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={v.phase}
              data-phase={v.phase}
              className="flex flex-1 flex-col"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -24 }}
              transition={{ duration: 0.3 }}
            >
              {v.phase === 'LOBBY' && <HostLobby v={v} joinUrl={joinUrl} />}
              {v.phase === 'SUBMITTING' && <HostSubmitting v={v} />}
              {v.phase === 'VOTING' && <HostVoting v={v} />}
              {v.phase === 'REVEAL' && <HostReveal v={v} />}
              {v.phase === 'SCOREBOARD' && <HostScoreboard v={v} />}
              {v.phase === 'GAME_OVER' && <HostGameOver v={v} />}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
