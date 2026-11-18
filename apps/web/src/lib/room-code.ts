const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I/O: easy to read aloud

export const newRoomCode = () =>
  Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

/**
 * Base URL phones should open. On a LAN demo `localhost` is useless to a phone, so this can be
 * overridden with NEXT_PUBLIC_JOIN_ORIGIN (e.g. http://192.168.0.5:3000).
 */
export const joinOrigin = () => process.env.NEXT_PUBLIC_JOIN_ORIGIN ?? window.location.origin;
