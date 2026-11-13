'use client';

import { useEffect, useRef, useState } from 'react';
import { clock } from '@/lib/connection';
import { sfx } from '@/lib/sfx';

/**
 * Smooth countdown driven by an ABSOLUTE server deadline.
 * Each frame recomputes time-left from the (offset-corrected) clock instead of decrementing,
 * so throttled/backgrounded tabs snap to the right value the moment they wake up.
 * The bar is mutated via ref, so there are no React re-renders per frame.
 */
export function TimerBar({ endsAt, durationMs, tick = false }: { endsAt: number; durationMs: number; tick?: boolean }) {
  const fill = useRef<HTMLDivElement>(null);
  const [seconds, setSeconds] = useState(() => Math.ceil(clock.timeLeft(endsAt) / 1000));

  // Tick once per second during the last 5 seconds (sfx itself is silent in hidden tabs).
  useEffect(() => {
    if (tick && seconds >= 1 && seconds <= 5) sfx.tick(seconds <= 2);
  }, [tick, seconds]);

  useEffect(() => {
    let raf = 0;
    let lastSecond = -1;
    const tick = () => {
      const left = clock.timeLeft(endsAt);
      const s = Math.ceil(left / 1000);
      if (fill.current) {
        fill.current.style.transform = `scaleX(${Math.min(1, left / durationMs)})`;
        fill.current.style.background = s <= 5 ? '#ff4d6d' : s <= 10 ? '#ffd166' : '#06d6a0';
      }
      if (s !== lastSecond) {
        lastSecond = s;
        setSeconds(s);
      }
      if (left > 0) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [endsAt, durationMs]);

  return (
    <div className="flex items-center gap-3" role="timer" aria-live="off" aria-label={`${seconds} seconds left`}>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/15">
        <div ref={fill} className="h-full origin-left rounded-full" style={{ transform: 'scaleX(1)' }} />
      </div>
      <span className="w-8 text-right text-lg font-bold tabular-nums">{seconds}</span>
    </div>
  );
}
