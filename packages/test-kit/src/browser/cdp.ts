import { Session } from "node:inspector/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { launchHeadlessChrome, type LaunchedChrome } from "./launch.js";
import { locateTestChrome } from "./locate.js";
import { ChromePage } from "./page.js";

export type CdpParams = Record<string, unknown>;
/** Receives an event's parameters and, for events of an attached page, its session id. */
export type CdpListener = (params: CdpParams, sessionId?: string) => void;

export interface ChromeConnectOptions {
  /** How long a command may take before it is rejected. */
  readonly commandTimeoutMs?: number;
  /** A page expression whose text is appended to the error of a timed-out `ChromePage.wait`. */
  readonly describe?: string;
  /**
   * Sample the main thread while commands run, so a timed-out command's error can list what kept Node busy.
   * Defaults to off; a command that does not time out writes no diagnostics and stops no sample itself.
   */
  readonly profileTimeouts?: boolean;
}

export interface ChromeStartOptions extends ChromeConnectOptions {
  /** Use this executable instead of looking for Chrome. */
  readonly executable?: string;
  /** Where Chrome keeps its profile; defaults to `chrome-profile` inside `directory`. */
  readonly profileDirectory?: string;
  readonly extraArgs?: readonly string[];
  readonly startTimeoutMs?: number;
}

interface PendingCommand {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

interface EventWaiter {
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

interface CdpMessage {
  id?: number;
  method?: string;
  params?: CdpParams;
  sessionId?: string;
  result?: unknown;
  error?: unknown;
}

const CHROME_TOP_METHODS = 3;
const PROFILE_SEGMENT_MS = 20_000;
const PROFILE_SAMPLE_INTERVAL_US = 10_000;
/**
 * How long an already-decided timeout may wait for one optional profile read before settling without samples.
 * The timeout is still decided at the command's own limit (plus at most the check-phase turn); this bounded read only
 * delays the rejection and does not extend the decision, so with `profileTimeouts` on failures stay inside
 * `limit`..`limit + 250` and the diagnostics report how long the read held them (`profileReadMs`). Held by RAC-1452.
 */
const DIAGNOSTICS_GRACE_MS = 150;
const SELF_TIME_TOP = 5;
const SELF_TIME_NAME_LIMIT = 120;
const SELF_TIME_URL_LIMIT = 200;

/** What a timed-out command attaches as `error.diagnostics`; it is kept out of `error.cause` on purpose. */
interface TimeoutDiagnostics {
  /** CDP messages this process had read while the command waited; it says nothing about socket backlog. */
  readonly chromeMessages: number;
  /** The three most frequent CDP methods among those messages, most frequent first. */
  readonly chromeTopMethods: readonly { readonly method: string; readonly count: number }[];
  /** Present only when `ChromeConnectOptions.profileTimeouts` was on and the sample could be read. */
  readonly nodeSelfTime?: readonly SelfTimeEntry[];
  /** Whether the sampled segment covered the command's whole window; a boundary can be missed on a busy thread. */
  readonly nodeSelfTimeComplete?: boolean;
  /** How many milliseconds the optional profile read held the rejection; only with `profileTimeouts` on. */
  readonly profileReadMs?: number;
}

interface SelfTimeEntry {
  readonly functionName: string;
  /** The script URL with its query string and fragment removed; `(anonymous)` scripts have no name. */
  readonly url: string;
  /** An estimate in milliseconds: each sample stands for at most one 10 ms sampling interval. */
  readonly selfMs: number;
}

interface CdpTimeoutFailure extends Error {
  diagnostics?: TimeoutDiagnostics;
}

interface InspectorProfile {
  readonly nodes: readonly { readonly id: number; readonly callFrame?: { readonly functionName?: string; readonly url?: string } }[];
  readonly samples?: readonly number[];
  readonly timeDeltas?: readonly number[];
}

function truncated(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

/** Strips a script URL's query string and fragment so a `sourceURL` token cannot leak into an error. */
function scriptUrlText(url: string | undefined): string {
  if (!url) return "";
  const query = url.indexOf("?"), fragment = url.indexOf("#");
  const cut = query === -1 ? fragment : fragment === -1 ? query : Math.min(query, fragment);
  return cut === -1 ? url : url.slice(0, cut);
}

/**
 * Aggregates a profile's samples into estimated self time per function, keeping only samples at or after
 * `windowStarted`. The first `timeDeltas` entry is the gap from `Profiler.start` to the first sample, so sample n
 * happened at `segmentStarted + Σ timeDeltas[0..n]` microseconds; compare that with the command's `performance.now()`.
 */
function selfTimeEntries(profile: InspectorProfile, segmentStarted: number, windowStarted: number): readonly SelfTimeEntry[] {
  const frames = new Map<number, { functionName: string; url: string }>();
  for (const node of profile.nodes) {
    const name = node.callFrame?.functionName?.trim();
    frames.set(node.id, {
      functionName: truncated(name && name.length > 0 ? name : "(anonymous)", SELF_TIME_NAME_LIMIT),
      url: truncated(scriptUrlText(node.callFrame?.url), SELF_TIME_URL_LIMIT),
    });
  }
  const self = new Map<string, { functionName: string; url: string; selfUs: number }>();
  const samples = profile.samples ?? [], deltas = profile.timeDeltas ?? [];
  let sampledUs = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const deltaUs = deltas[index] ?? 0;
    sampledUs += deltaUs;
    if (segmentStarted + sampledUs / 1000 < windowStarted) continue;
    const frame = frames.get(samples[index]);
    if (!frame) continue;
    const key = `${frame.functionName}\u0000${frame.url}`;
    const entry = self.get(key) ?? { ...frame, selfUs: 0 };
    entry.selfUs += deltaUs;
    self.set(key, entry);
  }
  return [...self.values()]
    .sort((left, right) => right.selfUs - left.selfUs)
    .slice(0, SELF_TIME_TOP)
    .map(({ functionName, url, selfUs }) => ({ functionName, url, selfMs: Math.round(selfUs / 1000) }));
}

function chromeTopMethods(methods: ReadonlyMap<string, number>, startedAt: ReadonlyMap<string, number>, limit: number): readonly { readonly method: string; readonly count: number }[] {
  const deltas: { method: string; count: number }[] = [];
  for (const [method, count] of methods) {
    const delta = count - (startedAt.get(method) ?? 0);
    if (delta > 0) deltas.push({ method, count: delta });
  }
  deltas.sort((left, right) => right.count - left.count || left.method.localeCompare(right.method));
  return deltas.slice(0, limit);
}

/**
 * Keeps a `node:inspector` CPU profile while `profileTimeouts` is on, restarted every `PROFILE_SEGMENT_MS` so samples
 * do not accumulate without bound. The rotation callback is subject to the same main-thread blocking as everything
 * else, so a segment boundary can be late; a window that predates the current segment is reported as incomplete rather
 * than guessed. The profile's `startTime` is not used: the segment start is the midpoint between two
 * `performance.now()` readings around `Profiler.start`, putting the alignment error at half that round trip, while
 * samples themselves are `PROFILE_SAMPLE_INTERVAL_US` apart (so each function's share is an estimate).
 */
class TimeoutProfiler {
  private rotation: ReturnType<typeof setInterval> | undefined;
  private segmentStarted = 0;
  private closed = false;
  private queue: Promise<unknown> = Promise.resolve();

  private constructor(private readonly session: Session) {}

  /** Starts sampling; diagnostics are best effort, so an unavailable inspector turns profiling off instead. */
  static async start(): Promise<TimeoutProfiler | undefined> {
    const session = new Session();
    session.connect();
    const profiler = new TimeoutProfiler(session);
    if (!(await profiler.beginSegment())) { session.disconnect(); return undefined; }
    profiler.rotation = setInterval(() => { void profiler.rotate(); }, PROFILE_SEGMENT_MS);
    profiler.rotation.unref();
    return profiler;
  }

  /**
   * Reads the self time at or after `windowStarted` and starts a fresh segment. `undefined` when it cannot be read. The
   * segment start is read in the same serialized step that stops its profile, so a read queued behind another one
   * cannot pair a fresh profile with the start of the segment that was current when it was requested.
   */
  recent(windowStarted: number): Promise<{ readonly nodeSelfTime: readonly SelfTimeEntry[]; readonly nodeSelfTimeComplete: boolean } | undefined> {
    return this.finishSegment().then((read) => {
      if (!read) return undefined;
      return { nodeSelfTime: selfTimeEntries(read.profile, read.segmentStarted, windowStarted), nodeSelfTimeComplete: windowStarted >= read.segmentStarted };
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    if (this.rotation) clearInterval(this.rotation);
    this.rotation = undefined;
    // A diagnostic read can be waiting on an inspector request that never gets answered. Closing must not wait for
    // it: `closed` keeps the queued step from restarting sampling, and dropping the session ends the read without the
    // caller having to release the hung request first.
    this.session.disconnect();
  }

  private beginSegment(): Promise<boolean> {
    return Promise.resolve().then(async () => {
      try {
        await this.session.post("Profiler.enable");
        await this.session.post("Profiler.setSamplingInterval", { interval: PROFILE_SAMPLE_INTERVAL_US });
        const before = performance.now();
        await this.session.post("Profiler.start");
        this.segmentStarted = (before + performance.now()) / 2;
        return true;
      } catch {
        // Profiling is a diagnostic; a missing inspector keeps the harness working without a profile.
        return false;
      }
    });
  }

  private finishSegment(): Promise<{ readonly profile: InspectorProfile; readonly segmentStarted: number } | undefined> {
    const run = this.queue.then(async () => {
      try {
        const stopped = (await this.session.post("Profiler.stop")) as { readonly profile: InspectorProfile };
        // Read the start while this segment is still the current one: an earlier queued read may already have restarted
        // sampling and the next one will, so the profile and the window it covers must leave this step together.
        const segmentStarted = this.segmentStarted;
        if (!this.closed) await this.beginSegment();
        return { profile: stopped.profile, segmentStarted };
      } catch {
        // A failed read must not replace the timeout error; the caller falls back to the message and `cause`.
        return undefined;
      }
    });
    this.queue = run.then(() => undefined, () => undefined);
    return run;
  }

  private async rotate(): Promise<void> {
    if (this.closed) return;
    await this.finishSegment();
  }
}

/** A Chrome DevTools Protocol connection to one browser, plus the Chrome process when `start` launched it. */
export class ChromeHarness {
  private nextId = 0;
  private closing = false;
  private closed = false;
  private readonly pending = new Map<number, PendingCommand>();
  private readonly waiters = new Set<EventWaiter>();
  private readonly listeners = new Map<string, Set<CdpListener>>();
  private messagesSeen = 0;
  private readonly messageCounts = new Map<string, number>();

  private constructor(
    private readonly socket: WebSocket,
    readonly commandTimeoutMs: number,
    readonly describe: string | undefined,
    private readonly browser: LaunchedChrome | undefined,
    private readonly profile: TimeoutProfiler | undefined,
  ) {
    socket.addEventListener("message", (event) => this.receive(String(event.data)));
    socket.addEventListener("close", () => this.connectionClosed());
  }

  /** Attaches to a DevTools endpoint that is already running. `close()` then closes only the connection. */
  static async connect(debuggerUrl: string, options: ChromeConnectOptions = {}, browser?: LaunchedChrome): Promise<ChromeHarness> {
    const socket = new WebSocket(debuggerUrl);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error(`CDP connection failed: ${debuggerUrl}`)), { once: true });
    });
    const profile = options.profileTimeouts ? await TimeoutProfiler.start() : undefined;
    return new ChromeHarness(socket, options.commandTimeoutMs ?? 20_000, options.describe, browser, profile);
  }

  /** Launches headless Chrome with a profile under `directory`. Resolves to `null` when the machine has no Chrome. */
  static start(directory: string, options: ChromeStartOptions & { readonly executable: string }): Promise<ChromeHarness>;
  static start(directory: string, options?: ChromeStartOptions): Promise<ChromeHarness | null>;
  static async start(directory: string, options: ChromeStartOptions = {}): Promise<ChromeHarness | null> {
    const executable = options.executable ?? locateTestChrome();
    if (!executable) return null;
    const browser = await launchHeadlessChrome({
      executable,
      profileDirectory: options.profileDirectory ?? join(directory, "chrome-profile"),
      ...(options.extraArgs ? { extraArgs: options.extraArgs } : {}),
      ...(options.startTimeoutMs !== undefined ? { startTimeoutMs: options.startTimeoutMs } : {}),
    });
    try { return await ChromeHarness.connect(browser.debuggerUrl, options, browser); }
    catch (error) {
      await browser.close();
      throw error;
    }
  }

  /** Sends one protocol command. A timeout names the method and, for an evaluation, the start of the expression. */
  command<T = unknown>(method: string, params: CdpParams = {}, sessionId?: string, timeoutMs = this.commandTimeoutMs): Promise<T> {
    const id = ++this.nextId;
    return new Promise<T>((resolve, reject) => {
      if (this.closed) { reject(new Error(`CDP connection closed before ${method}`)); return; }
      const expression = typeof params.expression === "string" ? ` · ${params.expression.slice(0, 320)}` : "";
      // Keep the command's caller, not only the timer callback, when a renderer stops answering.
      const started = performance.now(), failure = new Error(`CDP timeout: ${method}${expression}`) as CdpTimeoutFailure;
      const cpuStarted = process.cpuUsage(), loopStarted = performance.eventLoopUtilization();
      const messagesStarted = this.messagesSeen, methodsStarted = new Map(this.messageCounts);
      const timer = setTimeout(() => {
        // The reply may already be in the socket while this timer is due: let one check-phase turn run first so
        // `receive()` can settle the command, and only decide the timeout when the entry is still waiting.
        setImmediate(() => {
          const entry = this.pending.get(id);
          if (!entry || entry.timer !== timer) return;
          this.pending.delete(id);
          const cpu = process.cpuUsage(cpuStarted), loop = performance.eventLoopUtilization(loopStarted);
          failure.cause = { nodeCpuMs: Math.round((cpu.user + cpu.system) / 1000), eventLoopActiveMs: Math.round(loop.active), eventLoopIdleMs: Math.round(loop.idle) };
          const diagnostics: TimeoutDiagnostics = {
            chromeMessages: this.messagesSeen - messagesStarted,
            chromeTopMethods: chromeTopMethods(this.messageCounts, methodsStarted, CHROME_TOP_METHODS),
          };
          const decidedAt = performance.now();
          const settle = (profile: { readonly nodeSelfTime: readonly SelfTimeEntry[]; readonly nodeSelfTimeComplete: boolean } | undefined, profiling: boolean) => {
            // A profile that could not be read inside its grace leaves no samples and must not claim the window was
            // covered: empty self time with `nodeSelfTimeComplete: false` says "not proven" rather than guessing.
            const counters = profile ? { ...diagnostics, ...profile }
              : profiling ? { ...diagnostics, nodeSelfTime: [], nodeSelfTimeComplete: false }
              : diagnostics;
            // `elapsed` is the whole milliseconds the command stayed unsettled, including this optional read, rounded down so
            // it never claims more than the caller waited; minus `profileReadMs` and `limit` it leaves the timer's own lateness.
            if (profiling) failure.diagnostics = { ...counters, profileReadMs: Math.max(0, Math.round(performance.now() - decidedAt)) };
            else failure.diagnostics = counters;
            failure.message += ` (elapsed ${Math.floor(performance.now() - started)}ms; limit ${timeoutMs}ms)`;
            reject(failure);
          };
          const profiler = this.profile;
          if (!profiler) { settle(undefined, false); return; }
          // Reading the sample is asynchronous; a failed read keeps the message and `cause` and settles in the same way.
          // It is only a diagnostic, so bound how long it may postpone the answer the command's caller already waited
          // past: after the grace the timeout settles with the Chrome counters and `cause` alone.
          let grace: ReturnType<typeof setTimeout> | undefined;
          const bounded = new Promise<undefined>((resolve) => {
            grace = setTimeout(() => resolve(undefined), DIAGNOSTICS_GRACE_MS);
            grace.unref();
          });
          const finish = (summary: { readonly nodeSelfTime: readonly SelfTimeEntry[]; readonly nodeSelfTimeComplete: boolean } | undefined) => {
            if (grace) clearTimeout(grace);
            settle(summary, true);
          };
          void Promise.race([profiler.recent(started), bounded]).then(finish, () => { finish(undefined); });
        });
      }, timeoutMs);
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject, timer });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  /** Calls `listener` for every event of this kind until the returned function is called. */
  on(method: string, listener: CdpListener): () => void {
    const listeners = this.listeners.get(method) ?? new Set<CdpListener>();
    this.listeners.set(method, listeners);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }

  /** Resolves with the first event of this kind that satisfies `predicate`. */
  event(method: string, predicate: (params: CdpParams) => boolean = () => true, timeoutMs = 15_000): Promise<CdpParams> {
    return new Promise((resolve, reject) => {
      let off = () => {};
      const waiter: EventWaiter = {
        timer: setTimeout(() => waiter.reject(new Error(`CDP event timeout: ${method}`)), timeoutMs),
        reject: (error) => { clearTimeout(waiter.timer); this.waiters.delete(waiter); off(); reject(error); },
      };
      off = this.on(method, (params) => {
        if (!predicate(params)) return;
        clearTimeout(waiter.timer);
        this.waiters.delete(waiter);
        off();
        resolve(params);
      });
      this.waiters.add(waiter);
    });
  }

  /** Opens a page, or attaches to the target `targetId`. */
  async page(targetId?: string): Promise<ChromePage> {
    const target = targetId ?? (await this.command<{ targetId: string }>("Target.createTarget", { url: "about:blank" })).targetId;
    const { sessionId } = await this.command<{ sessionId: string }>("Target.attachToTarget", { targetId: target, flatten: true });
    return new ChromePage(this, sessionId, target);
  }

  /** Drops pending work without settling it, closes the connection and ends the Chrome this harness started. */
  async close(): Promise<void> {
    this.closing = true;
    for (const entry of this.pending.values()) clearTimeout(entry.timer);
    for (const waiter of this.waiters) clearTimeout(waiter.timer);
    this.pending.clear();
    this.waiters.clear();
    this.listeners.clear();
    this.socket.close();
    await this.profile?.close();
    await this.browser?.close();
  }

  private receive(raw: string): void {
    const message = JSON.parse(raw) as CdpMessage;
    this.messagesSeen += 1;
    if (typeof message.method === "string") {
      this.messageCounts.set(message.method, (this.messageCounts.get(message.method) ?? 0) + 1);
      for (const listener of [...(this.listeners.get(message.method) ?? [])]) listener(message.params ?? {}, message.sessionId);
      return;
    }
    const entry = message.id === undefined ? undefined : this.pending.get(message.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(message.id!);
    if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
    else entry.resolve(message.result);
  }

  /** A connection that ends without `close()` (Chrome crashed) fails what is waiting at once instead of at its timeout. */
  private connectionClosed(): void {
    this.closed = true;
    if (this.closing) return;
    const error = new Error("CDP connection closed");
    for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.reject(error); }
    for (const waiter of [...this.waiters]) waiter.reject(error);
    this.pending.clear();
  }
}
