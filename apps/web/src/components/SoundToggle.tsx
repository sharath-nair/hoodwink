'use client';

import { useSyncExternalStore } from 'react';
import { isMuted, setMuted, sfx, subscribeMuted } from '@/lib/sfx';

export function SoundToggle() {
  // Server snapshot is `false` so SSR and first client render match; it corrects after hydration.
  const muted = useSyncExternalStore(subscribeMuted, isMuted, () => false);
  return (
    <button
      type="button"
      aria-pressed={muted}
      aria-label={muted ? 'Unmute sound effects' : 'Mute sound effects'}
      onClick={() => {
        setMuted(!muted);
        if (muted) sfx.click(); // we just unmuted: confirm audibly
      }}
      className="fixed right-3 top-3 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-xl backdrop-blur transition active:scale-90"
    >
      <span aria-hidden>{muted ? '🔇' : '🔊'}</span>
    </button>
  );
}
