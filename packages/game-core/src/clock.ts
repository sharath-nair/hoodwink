/**
 * NTP-style clock offset estimation.
 *
 * Phase deadlines are absolute SERVER timestamps. A client's `Date.now()` can be seconds off, so
 * `expiresAt - Date.now()` alone is wrong. Instead the client pings the server, assumes the reply
 * took half the round trip, and learns `offset = serverNow - (t0 + rtt / 2)`.
 */
export function estimateOffset(t0: number, serverNow: number, t2: number): { offset: number; rtt: number } {
  const rtt = t2 - t0;
  return { offset: serverNow - (t0 + rtt / 2), rtt };
}

export class ClockSync {
  private samples: { offset: number; rtt: number }[] = [];

  constructor(
    private readonly clock: () => number = Date.now,
    private readonly maxSamples = 8,
  ) {}

  addSample(t0: number, serverNow: number, t2: number = this.clock()): void {
    this.samples.push(estimateOffset(t0, serverNow, t2));
    if (this.samples.length > this.maxSamples) this.samples.shift();
  }

  get sampleCount(): number {
    return this.samples.length;
  }

  /** Median offset of the lowest-RTT half of the samples (low RTT => least asymmetric error). */
  get offset(): number {
    if (!this.samples.length) return 0;
    const best = [...this.samples].sort((a, b) => a.rtt - b.rtt).slice(0, Math.ceil(this.samples.length / 2));
    const offsets = best.map((s) => s.offset).sort((a, b) => a - b);
    const mid = Math.floor(offsets.length / 2);
    return offsets.length % 2 ? offsets[mid]! : (offsets[mid - 1]! + offsets[mid]!) / 2;
  }

  /** Best estimate of the current server time. */
  now(): number {
    return this.clock() + this.offset;
  }

  timeLeft(expiresAt: number): number {
    return Math.max(0, expiresAt - this.now());
  }
}
