import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { atomicWriteFileSync } from "@molis-ai/molis-work-storage";
import { repeatingFailure } from "./host-log.js";

/**
 * When Molis Work was not running here (specs/proactive-assistant/resident-runtime-design.md §3): the Host writes `run/presence.json`
 * while it runs, a heartbeat a minute and the time it stopped, and when it starts it reads the last one and writes down the stretch it
 * was not running — quit, crashed, or the computer asleep (two heartbeats far apart while it ran). Only times, never what ran.
 */

/** The Home's `run/` directory: what says about the running Host itself (this record, the address file). Reset by a snapshot. */
export const RUN_DIRECTORY = "run";
export const RUN_HOME_STORE = { path: RUN_DIRECTORY } as const;
const PRESENCE_FILE = "presence.json";
const PRESENCE_SCHEMA_VERSION = /* @version format.home.run.presence */ 1;
/** How often the Host says it is alive; a heartbeat that comes more than `SLEEP_AFTER_MS` after the last means the computer slept. */
export const PRESENCE_HEARTBEAT_MS = 60_000;
export const PRESENCE_SLEEP_AFTER_MS = 3 * 60_000;
const GAPS_KEPT = 20;

export type RuntimeGapCause = "quit" | "crash" | "sleep";
export interface RuntimeGap { readonly from: string; readonly to: string; readonly cause: RuntimeGapCause }
interface PresenceRecord { schema_version: number; started_at: string; last_alive_at: string; stopped_at: string | null; gaps: RuntimeGap[] }

const CAUSES: readonly string[] = ["quit", "crash", "sleep"] satisfies RuntimeGapCause[];
const instant = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));

/** The record as it was left, or null when there is none or it is not one this version wrote (it is then started afresh). */
function readRecord(file: string): PresenceRecord | null {
  let value: unknown;
  try { value = JSON.parse(readFileSync(file, "utf8")); } catch { return null; /* no record yet, or a torn one: the Host starts a new one */ }
  if (!value || typeof value !== "object") return null;
  const record = value as Partial<Record<keyof PresenceRecord, unknown>>;
  if (record.schema_version !== PRESENCE_SCHEMA_VERSION || !instant(record.started_at) || !instant(record.last_alive_at)
    || !(record.stopped_at === null || instant(record.stopped_at)) || !Array.isArray(record.gaps)) return null;
  const gaps = record.gaps.filter((gap): gap is RuntimeGap => Boolean(gap) && instant(gap.from) && instant(gap.to) && CAUSES.includes(gap.cause));
  return { schema_version: PRESENCE_SCHEMA_VERSION, started_at: record.started_at, last_alive_at: record.last_alive_at, stopped_at: record.stopped_at, gaps };
}

export interface HostPresenceOptions {
  readonly homeDirectory: string;
  readonly now?: () => Date;
  /** Called once a heartbeat finds the computer slept, before the `onHostWake` listeners: owners look for what they missed right away. */
  readonly onWake?: () => void;
  readonly heartbeatMs?: number;
}

/** The presence of the Host this process runs (one Host per process), for the routes that show it. */
let running: HostPresence | null = null;
export function currentHostPresence(): HostPresence | null { return running; }

/** What looks at once when the computer wakes: each account space's periodic work registers here while it runs (`PeriodicTasks.wake`). */
const wakeListeners = new Set<() => void>();
export function onHostWake(listener: () => void): () => void { wakeListeners.add(listener); return () => { wakeListeners.delete(listener); }; }

export class HostPresence {
  readonly #file: string;
  readonly #now: () => Date;
  #record: PresenceRecord | null = null;
  #timer: ReturnType<typeof setInterval> | null = null;
  readonly #unwritable = repeatingFailure("host", "presence_unwritable");

  constructor(private readonly options: HostPresenceOptions) {
    this.#file = join(options.homeDirectory, RUN_DIRECTORY, PRESENCE_FILE);
    this.#now = options.now ?? (() => new Date());
  }

  /** Read how the last run ended, write the stretch since as a gap, and start the heartbeat. */
  start(): void {
    const now = this.#now().toISOString(), last = readRecord(this.#file);
    const gaps = last?.gaps ?? [];
    if (last) gaps.push(last.stopped_at ? { from: last.stopped_at, to: now, cause: "quit" } : { from: last.last_alive_at, to: now, cause: "crash" });
    this.#record = { schema_version: PRESENCE_SCHEMA_VERSION, started_at: now, last_alive_at: now, stopped_at: null, gaps: gaps.slice(-GAPS_KEPT) };
    this.#write();
    running = this;
    if (!this.#timer) { this.#timer = setInterval(() => this.beat(), this.options.heartbeatMs ?? PRESENCE_HEARTBEAT_MS); this.#timer.unref?.(); }
  }

  /** One heartbeat. A long silence since the last one was the computer asleep: it is written down and the owners are woken. */
  beat(): void {
    const record = this.#record;
    if (!record) return;
    const now = this.#now(), last = Date.parse(record.last_alive_at);
    const slept = now.getTime() - last > PRESENCE_SLEEP_AFTER_MS;
    if (slept) record.gaps = [...record.gaps, { from: record.last_alive_at, to: now.toISOString(), cause: "sleep" as const }].slice(-GAPS_KEPT);
    record.last_alive_at = now.toISOString();
    this.#write();
    if (slept) { this.options.onWake?.(); for (const listener of [...wakeListeners]) listener(); }
  }

  /** A clean stop: the next start reads `quit`, not `crash`. */
  stop(): void {
    if (this.#timer) { clearInterval(this.#timer); this.#timer = null; }
    if (running === this) running = null;
    const record = this.#record;
    if (!record) return;
    const now = this.#now().toISOString();
    record.last_alive_at = now; record.stopped_at = now;
    this.#write();
    this.#record = null;
  }

  /** The latest stretches it was not running, newest first. */
  gaps(limit = 5): RuntimeGap[] {
    return [...(this.#record?.gaps ?? [])].reverse().slice(0, limit);
  }

  #write(): void {
    try {
      mkdirSync(join(this.options.homeDirectory, RUN_DIRECTORY), { recursive: true, mode: 0o700 });
      atomicWriteFileSync(this.#file, `${JSON.stringify(this.#record)}\n`, { mode: 0o600 });
      this.#unwritable.worked("presence");
    } catch (error) {
      // A heartbeat that cannot be written costs only the record of this stretch; the Host goes on running.
      this.#unwritable.failed("presence", error);
    }
  }
}
