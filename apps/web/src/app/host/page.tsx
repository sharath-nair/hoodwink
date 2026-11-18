'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { newRoomCode } from '@/lib/room-code';

/** /host creates a fresh room code and sends the big screen to it. */
export default function HostIndex() {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/host/${newRoomCode()}`);
  }, [router]);
  return <p className="m-auto animate-pulse text-white/70">Creating room…</p>;
}
