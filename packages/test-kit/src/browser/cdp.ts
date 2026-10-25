import { join } from "node:path";
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

/** A Chrome DevTools Protocol connection to one browser, plus the Chrome process when `start` launched it. */
export class ChromeHarness {
  private nextId = 0;
  private closing = false;
  private closed = false;
  private readonly pending = new Map<number, PendingCommand>();
  private readonly waiters = new Set<EventWaiter>();
  private readonly listeners = new Map<string, Set<CdpListener>>();

  private constructor(
    private readonly socket: WebSocket,
    readonly commandTimeoutMs: number,
    readonly describe: string | undefined,
    private readonly browser: LaunchedChrome | undefined,
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
    return new ChromeHarness(socket, options.commandTimeoutMs ?? 20_000, options.describe, browser);
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
      const started = performance.now(), failure = new Error(`CDP timeout: ${method}${expression}`);
      const timer = setTimeout(() => {
        this.pending.delete(id);
        failure.message += ` (elapsed ${Math.round(performance.now() - started)}ms; limit ${timeoutMs}ms)`;
        reject(failure);
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
    await this.browser?.close();
  }

  private receive(raw: string): void {
    const message = JSON.parse(raw) as CdpMessage;
    if (typeof message.method === "string") {
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
