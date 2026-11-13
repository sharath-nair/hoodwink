import { describe, expect, it } from 'vitest';
import { ClockSync, estimateOffset } from './clock';

describe('estimateOffset', () => {
  it('recovers a known skew under symmetric latency', () => {
    // Client clock is 5s BEHIND the server; 100ms each way.
    const skew = 5000;
    const t0 = 1_000_000;
    const serverNow = t0 + skew + 100;
    const t2 = t0 + 200;
    const { offset, rtt } = estimateOffset(t0, serverNow, t2);
    expect(rtt).toBe(200);
    expect(offset).toBe(skew);
  });
});

describe('ClockSync', () => {
  it('makes two skewed clients agree on when a server deadline hits', () => {
    const serverTime = { v: 10_000_000 };
    const aheadClock = () => serverTime.v + 7000; // 7s ahead
    const behindClock = () => serverTime.v - 3000; // 3s behind
    const a = new ClockSync(aheadClock);
    const b = new ClockSync(behindClock);

    for (const c of [a, b]) {
      const t0 = c.now() - c.offset; // raw client clock
      serverTime.v += 40; // request travels
      const serverNow = serverTime.v;
      serverTime.v += 40; // reply travels
      c.addSample(t0, serverNow, t0 + 80);
    }

    const expiresAt = serverTime.v + 30_000;
    expect(Math.abs(a.timeLeft(expiresAt) - b.timeLeft(expiresAt))).toBeLessThanOrEqual(1);
    expect(a.timeLeft(expiresAt)).toBeCloseTo(30_000, -1);
  });

  it('prefers low-RTT samples so a latency spike does not skew the offset', () => {
    const c = new ClockSync(() => 0);
    for (let i = 0; i < 4; i++) c.addSample(0, 1000 + 20, 40); // true offset 1000, rtt 40
    c.addSample(0, 1000 + 900, 1800); // spike, rtt 1800, offset 1000 (symmetric) but noisy case below
    c.addSample(0, 3000, 1000); // asymmetric garbage sample, rtt 1000
    expect(c.offset).toBeCloseTo(1000, 0);
  });

  it('clamps time left at zero', () => {
    const c = new ClockSync(() => 5000);
    expect(c.timeLeft(1000)).toBe(0);
  });
});
