import { execFile } from 'node:child_process';

export interface ProcessSample {
  readonly rssKb: number;
  readonly cpuMs: number;
}

export interface WatchedSandboxProcess {
  readonly pid: number;
  readonly rssLimitKb: number;
  readonly cpuLimitMs: number;
  onExceeded(kind: 'memory' | 'cpu'): void;
}

export interface BatchProcessMonitor {
  watch(entry: WatchedSandboxProcess): () => void;
  snapshot(): { activePids: number; polls: number; batchedPids: number };
}

/** Parses macOS/POSIX `ps -o time=` durations (`MM:SS.cc`, `HH:MM:SS`, `D-HH:MM:SS`) into milliseconds. */
export function parsePsCpuMs(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return Number.NaN;
  let days = 0;
  let rest = trimmed;
  const dash = rest.indexOf('-');
  if (dash >= 0) {
    days = Number(rest.slice(0, dash));
    rest = rest.slice(dash + 1);
    if (!Number.isFinite(days) || days < 0) return Number.NaN;
  }
  const parts = rest.split(':').map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some(value => !Number.isFinite(value) || value < 0)) {
    return Number.NaN;
  }
  const seconds = parts.reduce((total, value) => total * 60 + value, 0) + days * 86_400;
  return seconds * 1000;
}

/** Parses `/bin/ps -o pid=,rss=,time= -p <p1,p2,...>` lines keyed by PID. */
export function parsePsBatchOutput(output: string): Map<number, ProcessSample> {
  const samples = new Map<number, ProcessSample>();
  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 3) continue;
    const pid = Number(parts[0]);
    const rssKb = Number(parts[1]);
    const cpuMs = parsePsCpuMs(parts[2]!);
    if (!Number.isSafeInteger(pid) || pid <= 0 || !Number.isFinite(rssKb) || rssKb < 0 || !Number.isFinite(cpuMs)) continue;
    samples.set(pid, { rssKb, cpuMs });
  }
  return samples;
}

function sampleWithPs(pids: readonly number[]): Promise<Map<number, ProcessSample>> {
  if (pids.length === 0) return Promise.resolve(new Map());
  return new Promise(resolve => {
    execFile(
      '/bin/ps',
      ['-o', 'pid=', '-o', 'rss=', '-o', 'time=', '-p', pids.join(',')],
      { timeout: 1000, maxBuffer: Math.max(4096, pids.length * 128), env: {} },
      (error, output) => {
        // When all queried PIDs have already exited, `ps` exits non-zero with empty output; partial exits still return lines.
        if (!output) {
          resolve(new Map());
          return;
        }
        if (error && !output.trim()) {
          resolve(new Map());
          return;
        }
        resolve(parsePsBatchOutput(output));
      },
    );
  });
}

/**
 * Single host-wide process monitor shared across all active sandbox runners (102-2, S-15).
 * Runs zero timers and zero `/bin/ps` forks when idle; polls all live runners in one batched call every `intervalMs`.
 */
export function createBatchProcessMonitor(options?: {
  intervalMs?: number;
  sample?: (pids: readonly number[]) => Promise<Map<number, ProcessSample>>;
}): BatchProcessMonitor {
  const intervalMs = options?.intervalMs ?? 200;
  const sample = options?.sample ?? sampleWithPs;
  const entries = new Map<number, WatchedSandboxProcess>();
  let timer: NodeJS.Timeout | undefined;
  let sampling = false;
  let polls = 0;
  let batchedPids = 0;

  const stopTimerIfIdle = () => {
    if (entries.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };

  const poll = () => {
    if (sampling) return;
    if (entries.size === 0) {
      stopTimerIfIdle();
      return;
    }
    const pids = [...entries.keys()];
    sampling = true;
    polls++;
    batchedPids += pids.length;
    void sample(pids)
      .then(samples => {
        for (const [pid, measured] of samples) {
          const entry = entries.get(pid);
          if (!entry) continue;
          if (measured.rssKb > entry.rssLimitKb) {
            entries.delete(pid);
            entry.onExceeded('memory');
          } else if (measured.cpuMs > entry.cpuLimitMs) {
            entries.delete(pid);
            entry.onExceeded('cpu');
          }
        }
      })
      .catch(() => undefined)
      .finally(() => {
        sampling = false;
        stopTimerIfIdle();
      });
  };

  return {
    watch(entry) {
      entries.set(entry.pid, entry);
      if (!timer) {
        timer = setInterval(poll, intervalMs);
        timer.unref();
      }
      return () => {
        if (entries.get(entry.pid) === entry) {
          entries.delete(entry.pid);
          stopTimerIfIdle();
        }
      };
    },
    snapshot() {
      return { activePids: entries.size, polls, batchedPids };
    },
  };
}

export const sharedSandboxProcessMonitor: BatchProcessMonitor = createBatchProcessMonitor();
