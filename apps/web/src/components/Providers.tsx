'use client';

import { useEffect } from 'react';
import { MotionConfig } from 'framer-motion';
import { sfx, unlock } from '@/lib/sfx';
import { SoundToggle } from './SoundToggle';

/** `reducedMotion="user"` makes every Framer animation honour prefers-reduced-motion. */
export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // One delegated listener: unlock audio on the first gesture, and click-sound every enabled button.
    const onPointerDown = (e: PointerEvent) => {
      unlock();
      const button = (e.target as Element | null)?.closest?.('button');
      if (button && !button.disabled && !button.hasAttribute('data-silent')) sfx.click();
    };
    document.addEventListener('pointerdown', onPointerDown, { passive: true });
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <SoundToggle />
      {children}
    </MotionConfig>
  );
}
