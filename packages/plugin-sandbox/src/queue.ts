import { SandboxError } from './schema.js';

/** Per-installation queue; no project-global lock. Admission includes the running task. */
export class BoundedQueue {
  private pending: Array<{ run: () => Promise<unknown>; resolve: (v: unknown) => void; reject: (e: unknown) => void }> = [];
  private running = false;
  private closed?: Error;
  constructor(private readonly capacity: number) {}
  submit<T>(run: () => Promise<T>): Promise<T> {
    if (this.closed) return Promise.reject(this.closed);
    if (this.pending.length + Number(this.running) >= this.capacity) return Promise.reject(new SandboxError('QUEUE_FULL', 'Sandbox queue is full'));
    return new Promise<T>((resolve, reject) => { this.pending.push({ run, resolve: resolve as (v: unknown) => void, reject }); void this.drain(); });
  }
  close(error = new SandboxError('STOPPED', 'Sandbox stopped')): void {
    this.closed = error;
    for (const job of this.pending.splice(0)) job.reject(error);
  }
  private async drain(): Promise<void> {
    if (this.running || this.closed) return;
    const job = this.pending.shift();
    if (!job) return;
    this.running = true;
    try { job.resolve(await job.run()); } catch (error) { job.reject(error); }
    finally { this.running = false; void this.drain(); }
  }
}

export class RateBudget {
  private tokens: number;
  private last = performance.now();
  constructor(private readonly perMinute: number) { this.tokens = perMinute; }
  consume(): void {
    const now = performance.now();
    this.tokens = Math.min(this.perMinute, this.tokens + (now - this.last) * this.perMinute / 60_000);
    this.last = now;
    if (this.tokens < 1) throw new SandboxError('RATE_LIMIT', 'Sandbox rate limit exceeded');
    this.tokens -= 1;
  }
}
