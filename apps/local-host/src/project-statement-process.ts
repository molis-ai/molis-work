import { fork, type ChildProcess } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { pluginProjectDatabaseErrors, type PluginProjectDatabaseRecord } from "@molis-ai/molis-work-plugin-runtime";
import type { StatementCall, StatementFatal, StatementMessage, StatementReply, StatementRow, StatementValue } from "./project-statement-protocol.js";

// The process that runs one sandboxed plugin's statements (specs/repository-anti-corruption/slices/sandbox-project-database-limits.md
// §2). Neither SQLite driver the Host has can interrupt a statement that is running, and `Worker.terminate()` cannot stop a native
// call, so a statement of a plugin the Host does not trust runs in a process the Host can kill: past its time, or past its memory,
// its controller kills the whole process with SIGKILL independently of the Host, and the plugin gets a coded error. The next statement starts a fresh process, so nothing of
// the killed one (its connections, an open transaction) is left. SQLite rolls a killed transaction back when the process's locks
// go; a write is never half committed.
//
// One process per plugin installation, started on its first statement, reused, and left after `idleMs` without one. A request
// runs at a time (a transaction holds the write lock from BEGIN to COMMIT); the others wait
// their turn, and the waiting does not count against their time.

export interface StatementLimits {
  /** Start the process and open the library. */
  readonly startMs: number;
  /** One read. */
  readonly readMs: number;
  /** One write statement, and BEGIN. */
  readonly writeMs: number;
  /** BEGIN to COMMIT, whole: the write lock the Host's own writers wait on is held no longer. */
  readonly transactionMs: number;
  /** The process's resident memory, sampled while a request is running. */
  readonly rssMb: number;
  /** V8's old space in the controller and SQL Worker; SQLite's own memory is not in it, `rssMb` bounds that. */
  readonly heapMb: number;
  readonly idleMs: number;
  readonly sampleMs: number;
}

export const DEFAULT_STATEMENT_LIMITS: StatementLimits = Object.freeze({
  startMs: 5_000, readMs: 5_000, writeMs: 2_000, transactionMs: 3_000, rssMb: 256, heapMb: 96, idleMs: 30_000, sampleMs: 50,
});

const WORKER = fileURLToPath(new URL("./project-statement-worker.js", import.meta.url));

type Step = Exclude<StatementCall, { readonly op: "open" }>;
type Answered = Extract<StatementReply, { ok: true }>;
interface Waiting { readonly id: number; settle(reply: StatementReply): void; fail(error: unknown): void }

/** The steps of one write transaction, between its BEGIN and its COMMIT; the process is held for it. */
export interface StatementTransaction {
  run(sql: string, parameters: readonly StatementValue[]): Promise<number>;
  commit(): Promise<void>;
}

export class ProjectStatementProcess {
  private readonly limits: StatementLimits;
  private child: ChildProcess | undefined;
  private readonly ended = new WeakMap<ChildProcess, unknown>();
  private waiting: Waiting | undefined;
  private tail: Promise<unknown> = Promise.resolve();
  private queued = 0;
  private next = 1;
  private idle: NodeJS.Timeout | undefined;
  private disposed = false;

  constructor(private readonly path: string, private readonly record: PluginProjectDatabaseRecord, limits: Partial<StatementLimits> = {}) {
    this.limits = Object.freeze({ ...DEFAULT_STATEMENT_LIMITS, ...limits });
  }

  async get(sql: string, parameters: readonly StatementValue[], limits: { readonly bytes: number }, signal?: AbortSignal): Promise<StatementRow | null> {
    return await this.exclusive(async () => (await this.call({ op: "get", sql, parameters, bytes: limits.bytes }, this.limits.readMs, signal)).row ?? null);
  }

  async all(sql: string, parameters: readonly StatementValue[], limits: { readonly rows: number; readonly bytes: number }, signal?: AbortSignal): Promise<StatementRow[]> {
    return await this.exclusive(async () => (await this.call({ op: "all", sql, parameters, rows: limits.rows, bytes: limits.bytes }, this.limits.readMs, signal)).rows ?? []);
  }

  /** `body` runs between BEGIN IMMEDIATE and the COMMIT it asks for; any way out of it without that COMMIT rolls the transaction back. */
  async transaction<T>(signal: AbortSignal | undefined, body: (transaction: StatementTransaction) => Promise<T>, beforeBegin: () => void): Promise<T> {
    return await this.exclusive(async () => {
      signal?.throwIfAborted();
      const owner = this.child ?? await this.start();
      signal?.throwIfAborted(); beforeBegin();
      const { writeMs, transactionMs } = this.limits;
      const deadline = Date.now() + transactionMs;
      const step = (request: Step, ms: number) => this.callOn(owner, request, Math.min(Date.now() + ms, deadline), signal);
      let open = false;
      try {
        await step({ op: "begin", transactionDeadline: deadline }, writeMs);
        open = true;
        return await body({
          run: async (sql, parameters) => (await step({ op: "run", sql, parameters }, writeMs)).changes ?? 0,
          commit: async () => { await step({ op: "commit" }, transactionMs); open = false; },
        });
      } finally {
        if (open && this.child === owner) {
          try { await this.callOn(owner, { op: "rollback" }, Math.min(Date.now() + writeMs, deadline)); }
          catch { if (this.child === owner) this.kill(undefined); }
        }
      }
    });
  }

  /** Kills the process; calls waiting for their turn are refused. */
  dispose(): void {
    this.disposed = true;
    this.kill(closed());
    clearTimeout(this.idle);
  }

  private exclusive<T>(job: () => Promise<T>): Promise<T> {
    this.queued++;
    clearTimeout(this.idle);
    const result = this.tail.then(() => { if (this.disposed) throw closed(); return job(); });
    this.tail = result.then(() => undefined, () => undefined);
    return result.finally(() => { if (--this.queued === 0 && !this.disposed) this.rest(); });
  }

  /** A standalone read may start a process; transaction steps must use the exact owner captured before BEGIN. */
  private async call(request: Step, ms: number, signal?: AbortSignal): Promise<Answered> {
    signal?.throwIfAborted();
    const child = this.child ?? await this.start();
    return this.callOn(child, request, Date.now() + ms, signal);
  }

  private async callOn(child: ChildProcess, request: Step, deadline: number, signal?: AbortSignal): Promise<Answered> {
    signal?.throwIfAborted();
    if (Date.now() >= deadline) {
      const error = timedOut();
      if (this.child === child) this.kill(error);
      throw error;
    }
    if (this.child !== child) throw this.ended.get(child) ?? pluginProjectDatabaseErrors.process_failed("项目库的语句进程已结束，事务不能继续");
    const reply = await this.exchange(child, request, deadline, signal);
    if (reply.ok) return reply;
    if (reply.kind === "refused") throw pluginProjectDatabaseErrors.statement_refused(reply.message);
    if (reply.kind === "too_large") throw pluginProjectDatabaseErrors.result_too_large(reply.message);
    throw new Error(reply.message);
  }

  private async start(): Promise<ChildProcess> {
    const child = fork(WORKER, [], { execArgv: [`--max-old-space-size=${this.limits.heapMb}`], stdio: ["ignore", "ignore", "ignore", "ipc"],
      env: { TMPDIR: tmpdir() }, cwd: tmpdir(), serialization: "json" });
    // The Host does not wait for it to leave, and it leaves on its own when the Host's end of the channel closes.
    child.unref();
    child.channel?.unref();
    this.child = child;
    child.on("message", reply => {
      const message = reply as StatementMessage;
      if (this.child === child && "fatal" in message) { this.kill(fatalError(message)); return; }
      const waiting = this.waiting;
      if (this.child === child && waiting && "id" in message && message.id === waiting.id) waiting.settle(message);
    });
    child.on("exit", (code, signal) => {
      if (this.child !== child) return;
      this.kill(pluginProjectDatabaseErrors.process_failed(`项目库的语句进程意外退出（${signal ?? code}）`));
    });
    child.on("error", error => {
      if (this.child !== child) return;
      this.kill(pluginProjectDatabaseErrors.process_failed(`项目库的语句进程无法运行：${error.message}`));
    });
    try {
      const { heapMb, rssMb, sampleMs } = this.limits;
      const reply = await this.exchange(child, { op: "open", path: this.path, record: this.record, limits: { heapMb, rssMb, sampleMs } }, Date.now() + this.limits.startMs);
      if (!reply.ok) throw new Error(reply.message);
    } catch (error) {
      this.kill(undefined);
      throw error;
    }
    return child;
  }

  /** The child enforces the same deadline independently; this timer also bounds a failed controller or IPC. */
  private exchange(child: ChildProcess, request: StatementCall, deadline: number, signal?: AbortSignal): Promise<StatementReply> {
    return new Promise<StatementReply>((resolve, reject) => {
      const id = this.next++;
      const kill = (error: unknown) => { if (this.child === child && this.waiting?.id === id) this.kill(error); };
      const timer = setTimeout(() => kill(timedOut()), Math.max(0, deadline - Date.now()));
      const abort = () => kill(signal?.reason ?? new DOMException("Aborted", "AbortError"));
      signal?.addEventListener("abort", abort, { once: true });
      const done = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); if (this.waiting?.id === id) this.waiting = undefined; };
      this.waiting = { id, settle: reply => { done(); resolve(reply); }, fail: error => { done(); reject(error); } };
      child.send({ ...request, id, deadline }, error => { if (error) kill(pluginProjectDatabaseErrors.process_failed(`项目库的语句进程收不到请求：${error.message}`)); });
    });
  }

  private fail(error: unknown): void {
    const waiting = this.waiting;
    this.waiting = undefined;
    waiting?.fail(error);
  }

  /** The process ends now, and whoever waits on it gets `error`. */
  private kill(error: unknown): void {
    const child = this.child;
    const reason = error ?? pluginProjectDatabaseErrors.process_failed("项目库的语句进程已终止");
    if (child) this.ended.set(child, reason);
    this.child = undefined;
    child?.kill("SIGKILL");
    if (this.waiting) this.fail(reason);
  }

  private rest(): void {
    this.idle = setTimeout(() => { if (!this.queued) this.kill(undefined); }, this.limits.idleMs);
    this.idle.unref();
  }
}

function closed(): ActionError {
  return new ActionError("actions.plugin_unavailable", "插件数据库已关闭");
}

function timedOut(): ActionError { return pluginProjectDatabaseErrors.statement_timeout("项目库的语句或事务已超过截止时间，已终止"); }
function fatalError(message: StatementFatal): ActionError {
  if (message.fatal === "timeout") return timedOut();
  if (message.fatal === "memory") return pluginProjectDatabaseErrors.statement_memory(message.message);
  return pluginProjectDatabaseErrors.process_failed(message.message);
}
