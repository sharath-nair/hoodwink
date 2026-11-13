'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O: easy to read aloud
const newCode = () => Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

export default function Home() {
  const router = useRouter();
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem('hoodwink:name') ?? '';
    } catch {
      return '';
    }
  });
  const [code, setCode] = useState('');

  const go = (roomCode: string) => {
    try {
      localStorage.setItem('hoodwink:name', name.trim());
    } catch {
      /* storage unavailable */
    }
    router.push(`/room/${roomCode}`);
  };

  const ready = name.trim().length > 0;

  return (
    <div className="flex flex-1 flex-col justify-center gap-8">
      <div className="text-center">
        <h1 className="text-6xl font-black tracking-tight">Hoodwink</h1>
        <p className="mt-2 text-lg text-white/80">Write the lie. Fool your friends. Find the truth.</p>
      </div>

      <div className="card space-y-4 p-5">
        <label className="block text-sm font-semibold uppercase tracking-widest text-white/70">
          Your name
          <input
            value={name}
            maxLength={20}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-xl bg-white/90 px-4 py-3 text-lg font-bold normal-case tracking-normal text-slate-900 focus:outline-none focus:ring-4 focus:ring-pink-400"
          />
        </label>

        <button
          disabled={!ready}
          onClick={() => go(newCode())}
          className="w-full rounded-2xl bg-pink-500 py-4 text-xl font-black transition active:scale-95 disabled:opacity-40"
        >
          Create room
        </button>

        <div className="flex items-center gap-3 text-white/50">
          <div className="h-px flex-1 bg-white/20" />
          or join
          <div className="h-px flex-1 bg-white/20" />
        </div>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready && code.length === 4) go(code);
          }}
        >
          <input
            value={code}
            maxLength={4}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
            placeholder="CODE"
            aria-label="Room code"
            className="w-32 rounded-xl bg-white/90 px-4 py-3 text-center text-xl font-black tracking-[0.3em] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-pink-400"
          />
          <button
            disabled={!ready || code.length !== 4}
            className="flex-1 rounded-2xl bg-white/20 py-3 text-lg font-black transition active:scale-95 disabled:opacity-40"
          >
            Join
          </button>
        </form>
      </div>
    </div>
  );
}
