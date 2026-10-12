/** Fixed simulation intervals paced against wall time, with bounded catch-up after timer jitter. */
export class SimulationClock {
  private next = 0;
  constructor(
    private readonly intervalMs: number,
    private readonly maxBatch = 4,
  ) {}

  reset(now: number) {
    this.next = now;
  }

  dueSteps(now: number) {
    if (now < this.next) return 0;
    // A suspended tab must not replay seconds or minutes of missed wall time.
    if (now - this.next > this.intervalMs * this.maxBatch)
      this.next = now - this.intervalMs * (this.maxBatch - 1);
    return Math.min(
      this.maxBatch,
      Math.floor((now - this.next) / this.intervalMs) + 1,
    );
  }

  advanced() {
    this.next += this.intervalMs;
  }

  delay(now: number) {
    return Math.max(0, Math.ceil(this.next - now));
  }
}
