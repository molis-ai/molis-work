import { AsyncLocalStorage } from "node:async_hooks";
import type { HostCapabilityDescriptor, LocalHostProjectReference, LocalHostStatus } from "@molis-ai/molis-work-contracts/platform/app-host";
import { ActionError, actionEffect } from "@molis-ai/molis-work-contracts/platform/actions";
import { hostErrors } from "./host-errors.js";
import { inLanguagePreview, languagePreviewUnavailable } from "./web-locale.js";
import { hostLog } from "./host-log.js";
import type { LocalHostRuntimeFactory } from "./local-host-types.js";

/** How long one queued project operation may hold everything else of the project before the log names it. */
const HELD_IN_LINE_WARN_MS = 20_000;
/** How long a call waits for a project being put to sleep before it is refused as closing (`awake`). */
const AWAKE_WAIT_MS = 5_000;

export interface RuntimeEntry<Runtime> {
  reference: LocalHostProjectReference;
  runtime: Promise<Runtime>;
  /** Populated once `runtime` resolves; allows synchronous inspection without opening asleep projects. */
  opened?: Runtime;
  state: "opening" | "ready" | "closing";
  operationTail: Promise<void>;
  activeUses: number;
  queuedUses: number;
  /** When a call last entered or left the project (`Date.now()`): a project unused for long may be put to sleep (`sleepIfIdle`). */
  lastUsedAt: number;
  idleWaiters: Array<() => void>;
  /** Aborted when the project starts closing: a wait only observes, so it ends then instead of holding close until it times out. */
  observing: AbortController;
  actionDisposers: Set<() => void>;
}

/** `holdsQueue`: the call sits on the project's line (or inside one that does); a concurrent call runs beside the line and holds nothing. */
export interface ProjectScope<Runtime> { entry: RuntimeEntry<Runtime>; runtime: Runtime; active: boolean; holdsQueue: boolean }

/** What the line asks of the Host that owns it. */
export interface ProjectLineHost {
  /** Throws once the Host no longer takes work. */
  assertRunning(): void;
  running(): boolean;
  assertProjectAvailable?(projectId: string): void;
  /** Whether the registered action runs beside the line (`runsBesideLine`): read from the registry, never from the caller. */
  concurrent(capability: Pick<HostCapabilityDescriptor, "capability_id" | "version" | "action_provider">): boolean;
}

/**
 * Whether a registered action runs beside the project's line instead of waiting in it. One declared `scheduling: "concurrent"` owns its
 * transactions across its awaits; a pure read (a query whose effect is `read`) changes nothing another operation relies on, so it does not
 * wait behind a long command (batch 103-1). Every other command stays in line. Read from the registered descriptor, never from the caller.
 * A pure read is not cancelled when the project starts closing (`callSignal` is for declared concurrent work): it is short, and close waits for it.
 */
export function runsBesideLine(descriptor: Pick<HostCapabilityDescriptor, "capability_id" | "operation" | "action"> | undefined): boolean {
  const action = descriptor?.action;
  if (!action) return false;
  return action.scheduling === "concurrent" || (descriptor.operation === "query" && actionEffect(action, descriptor.capability_id) === "read");
}

export function normalizeReference(reference: LocalHostProjectReference): LocalHostProjectReference {
  const normalized = {
    project_id: reference.project_id.trim(),
    storage_key: reference.storage_key.trim(),
  };
  if (!normalized.project_id || !normalized.storage_key) {
    throw hostErrors.project_invalid("Local Host Project reference 不能为空");
  }
  return normalized;
}

function assertSameIdentity(current: LocalHostProjectReference, next: LocalHostProjectReference): void {
  if (current.project_id !== next.project_id || current.project_id !== next.project_id) {
    throw hostErrors.project_identity_conflict(`同一 storage_key 不能映射到不同 Project: ${current.project_id} / ${next.project_id}`);
  }
}

/**
 * Closes a project's runtime once it has opened. An open that failed (the Host closing under it, say) has already told
 * its own caller why; there is nothing to close, and the Host's close goes on (HOST-CLOSE-01).
 */
async function closeOpened<Runtime>(runtime: Promise<Runtime>, close: (runtime: Runtime) => void | Promise<void>): Promise<boolean> {
  const opened = await runtime.then(value => ({ value }), () => null);
  if (!opened) return false;
  await close(opened.value);
  return true;
}

/**
 * The projects a Host has open, and the line each one's operations wait in. Each storage key is opened exactly once, including
 * concurrent discovery, and all of its queued action calls are serialized through that Project runtime. The Home's own line is
 * `HomeLine`; a project's is the same mechanism with one runtime behind it.
 */
export class ProjectLine<Runtime> {
  private readonly entries = new Map<string, RuntimeEntry<Runtime>>();
  private readonly closingKeys = new Set<string>();
  /** The close under way for each project, so a second close waits for it instead of closing the same runtime twice. */
  private readonly closings = new Map<string, Promise<boolean>>();
  /** How many times each project was closed on purpose, so a sleep that ends after one does not mark it asleep again. */
  private readonly purposeful = new Map<string, number>();
  /** Projects being put to sleep: a call that comes meanwhile waits for it, then opens the project again (`awake`). */
  private readonly sleeping = new Map<string, Promise<unknown>>();
  /** Projects put to sleep and not opened since, with when they had last been used then: what the Home read of them before still holds. */
  private readonly rested = new Map<string, number>();
  /** Projects closed on purpose (not put to sleep) and not opened since: the Home does not open them to read them. */
  private readonly dismissed = new Set<string>();
  /** Reads that do not count as using a project (`quietly`): the Home's own reads, which must not keep every project awake. */
  private readonly quiet = new AsyncLocalStorage<true>();
  /** Quiet reads under way, some of them started by no request (the Home's background pass): the Host waits for them before it closes. */
  private readonly quietWork = new Set<Promise<unknown>>();
  private readonly scope = new AsyncLocalStorage<ProjectScope<Runtime>>();

  constructor(private readonly runtimeFactory: LocalHostRuntimeFactory<Runtime>, private readonly host: ProjectLineHost) {}

  /** The runtime scope the running call belongs to, if it runs inside one. */
  currentScope(): ProjectScope<Runtime> | undefined {
    return this.scope.getStore();
  }

  /** Whether the call that is running belongs to a project that has started closing. */
  scopeClosing(): boolean {
    return this.scope.getStore()?.entry.state === "closing";
  }

  isBusy(storageKey: string): boolean {
    const entry = this.entries.get(storageKey.trim());
    return !!entry && (entry.state !== 'ready' || entry.activeUses > 0 || entry.queuedUses > 0);
  }

  /** Synchronously lists currently opened (non-closing) project runtimes without waking asleep projects. */
  openRuntimes(): Runtime[] {
    const result: Runtime[] = [];
    for (const entry of this.entries.values()) {
      if (entry.state !== "closing" && entry.opened !== undefined) result.push(entry.opened);
    }
    return result;
  }

  private used(entry: RuntimeEntry<Runtime>): void {
    if (!this.quiet.getStore()) entry.lastUsedAt = Date.now();
  }

  /** Runs `work` without it counting as use of the projects it reads: they go to sleep as if it had not read them (`sleepIfIdle`). */
  quietly<T>(work: () => T): T {
    const result = this.quiet.run(true, work);
    if (result instanceof Promise) {
      const settled: Promise<unknown> = result.then(() => undefined, () => undefined).finally(() => this.quietWork.delete(settled));
      this.quietWork.add(settled);
    }
    return result;
  }

  /** Every quiet read under way has finished: once the Host stops opening projects, they end with refusals and give back what they hold. */
  async quietSettled(): Promise<void> {
    while (this.quietWork.size) await Promise.all([...this.quietWork]);
  }

  /**
   * A project that is not open: put to sleep (`asleep`, with when it had been last used then), closed on purpose (`closed`), or not
   * opened since the Host started (`never`). An open one is `open`, with when it was last used.
   */
  rest(storageKey: string): { state: "open" | "asleep" | "closed" | "never"; usedAt: number | undefined } {
    const entry = this.entries.get(storageKey);
    if (entry) return { state: "open", usedAt: entry.lastUsedAt };
    if (this.rested.has(storageKey)) return { state: "asleep", usedAt: this.rested.get(storageKey) };
    return { state: this.dismissed.has(storageKey) ? "closed" : "never", usedAt: undefined };
  }

  isClosing(storageKey: string): boolean {
    return this.closingKeys.has(storageKey);
  }

  /** A Catalog call can follow an existing runtime's closure without opening a runtime to get a signal. */
  existingObservation(reference: LocalHostProjectReference): Pick<RuntimeEntry<Runtime>, "observing"> | undefined {
    return this.entries.get(reference.storage_key);
  }

  /** The entry still serves its storage key and has not started closing. */
  isLive(entry: RuntimeEntry<Runtime>): boolean {
    return entry.state !== "closing" && this.entries.get(entry.reference.storage_key) === entry;
  }

  /** The entry has opened and still serves its storage key. */
  isReady(entry: RuntimeEntry<Runtime>): boolean {
    return entry.state === "ready" && this.entries.get(entry.reference.storage_key) === entry;
  }

  ensureEntry(reference: LocalHostProjectReference): RuntimeEntry<Runtime> {
    this.host.assertRunning();
    const normalized = normalizeReference(reference);
    this.host.assertProjectAvailable?.(normalized.project_id);
    this.assertCompatibleReference(normalized);
    if (this.closingKeys.has(normalized.storage_key)) {
      throw hostErrors.project_closing("这个 Project 的 Local Host runtime 正在关闭");
    }
    const existing = this.entries.get(normalized.storage_key);
    if (inLanguagePreview() && existing?.state !== "ready") throw languagePreviewUnavailable();
    // `assertCompatibleReference` already checked this identity.
    if (existing) {
      this.used(existing);
      return existing;
    }
    this.rested.delete(normalized.storage_key);
    this.dismissed.delete(normalized.storage_key);
    const entry: RuntimeEntry<Runtime> = {
      reference: normalized,
      runtime: Promise.resolve().then(() => this.runtimeFactory.open(normalized)),
      state: "opening",
      operationTail: Promise.resolve(),
      activeUses: 0, queuedUses: 0, lastUsedAt: this.quiet.getStore() ? 0 : Date.now(),
      idleWaiters: [], observing: new AbortController(),
      actionDisposers: new Set(),
    };
    this.entries.set(normalized.storage_key, entry);
    entry.runtime.then(
      runtime => {
        entry.opened = runtime;
        if (entry.state === "opening") entry.state = "ready";
      },
      () => {
        for (const dispose of entry.actionDisposers) dispose();
        if (this.entries.get(normalized.storage_key) === entry) this.entries.delete(normalized.storage_key);
      },
    );
    return entry;
  }

  assertCompatibleReference(reference: LocalHostProjectReference): void {
    this.host.assertRunning();
    const sameProject = [...this.entries.values()].find(entry => entry.reference.project_id === reference.project_id);
    if (sameProject && sameProject.reference.storage_key !== reference.storage_key) {
      throw hostErrors.project_identity_conflict("同一 Project 不能同时使用两个存储位置");
    }
    const existing = this.entries.get(reference.storage_key);
    if (existing) assertSameIdentity(existing.reference, reference);
  }

  async enqueue<Output>(
    reference: LocalHostProjectReference,
    capability: Pick<HostCapabilityDescriptor, "capability_id" | "version" | "action_provider">,
    execute: () => Promise<Output>,
    step = false,
  ): Promise<Output> {
    const sleeping = this.awake(reference);
    if (sleeping) await sleeping;
    const entry = this.ensureEntry(reference);
    const run = async (holdsQueue: boolean) => {
      const runtime = await entry.runtime;
      const scope = { entry, runtime, active: true, holdsQueue };
      return this.scope.run(scope, async () => {
        try { return await execute(); }
        finally { scope.active = false; }
      });
    };
    // Everything else of the project waits while a queued operation runs, so one that holds the line for long is named
    // in the log (only its capability, never its input): a page that stops answering is otherwise a mystery.
    const heldInLine = async () => {
      const started = Date.now();
      const watch = setInterval(() => hostLog.warn("actions", "project_queue_held", undefined, { capability: `${capability.capability_id}@${capability.version}`, project_id: reference.project_id, seconds: Math.round((Date.now() - started) / 1000) }), HELD_IN_LINE_WARN_MS);
      watch.unref?.();
      try { return await run(true); } finally { clearInterval(watch); }
    };
    // A Plugin action may await another declared Host capability. Queueing it behind itself deadlocks, so a call nested in
    // one that holds the line runs on it. A concurrent call holds nothing: what it calls waits its turn like anything else,
    // except a scene run (`step`), which is part of the call that triggered it and takes that call's place.
    const parent = this.scope.getStore();
    if (parent?.active && parent.entry === entry && (parent.holdsQueue || step)) return run(parent.holdsQueue);
    // Registered concurrent actions own their short transactions, only observe (following a live round) or touch no project
    // state (a model draft), and pure reads change nothing: held in line, each would keep every later operation of the project waiting
    // until it answers. They run beside the queue; withRuntime keeps close waiting; callSignal cancels the declared concurrent ones as
    // closing starts, before waiting for their cleanup. Concurrency is read from the registered descriptor, never from the caller.
    if (this.host.concurrent(capability)) return this.withRuntime(reference, () => run(false));
    entry.queuedUses += 1;
    const operation = entry.operationTail.then(heldInLine);
    entry.operationTail = operation.then(() => undefined, () => undefined);
    try { return await operation; } finally {
      entry.queuedUses -= 1;
      this.used(entry);
    }
  }

  /** Direct composition port for Host code that works inside one project's runtime. */
  async withRuntime<Result>(
    reference: LocalHostProjectReference,
    operation: (runtime: Runtime) => Result | Promise<Result>,
  ): Promise<Result> {
    const sleeping = this.awake(reference);
    if (sleeping) await sleeping;
    const entry = this.ensureEntry(reference);
    entry.activeUses += 1;
    try {
      return await operation(await entry.runtime);
    } finally {
      entry.activeUses -= 1;
      this.used(entry);
      if (entry.activeUses === 0) {
        for (const resolve of entry.idleWaiters.splice(0)) resolve();
      }
    }
  }

  /** Observe an already running project without constructing or activating one. */
  async withExistingRuntime<Result>(reference: LocalHostProjectReference, operation: (runtime: Runtime) => Result | Promise<Result>): Promise<Result | null> {
    this.host.assertRunning();
    const normalized = normalizeReference(reference);
    this.host.assertProjectAvailable?.(normalized.project_id);
    const entry = this.entries.get(normalized.storage_key);
    if (!entry || entry.state !== "ready" || entry.reference.project_id !== normalized.project_id) return null;
    entry.activeUses += 1;
    try {
      const runtime = await entry.runtime;
      this.host.assertRunning();
      this.host.assertProjectAvailable?.(normalized.project_id);
      if (!this.isReady(entry)) return null;
      return await operation(runtime);
    } finally {
      entry.activeUses -= 1;
      if (entry.activeUses === 0) for (const resolve of entry.idleWaiters.splice(0)) resolve();
    }
  }

  /** Current project states, owned by the caller; listing projects never copies the capability directory. */
  projects(): LocalHostStatus["projects"] {
    return [...this.entries.values()]
      .map((entry) => ({ ...entry.reference, state: entry.state }))
      .sort((left, right) => left.storage_key.localeCompare(right.storage_key));
  }

  closeProject(referenceOrStorageKey: LocalHostProjectReference | string): Promise<boolean> {
    const storageKey = typeof referenceOrStorageKey === "string"
      ? referenceOrStorageKey.trim()
      : normalizeReference(referenceOrStorageKey).storage_key;
    // Closed on purpose, open or asleep: the Home neither reads it nor opens it to read it until it is opened again.
    this.rested.delete(storageKey);
    this.dismissed.add(storageKey);
    this.purposeful.set(storageKey, (this.purposeful.get(storageKey) ?? 0) + 1);
    return this.close(storageKey);
  }

  private close(storageKey: string): Promise<boolean> {
    const under = this.closings.get(storageKey);
    if (under) return under;
    const entry = this.entries.get(storageKey);
    if (!entry) return Promise.resolve(false);
    // The entry goes before anyone waiting on it hears the close finished, so a close asked after that closes what is open then.
    const closing: Promise<boolean> = this.closeEntry(storageKey, entry)
      .finally(() => { if (this.closings.get(storageKey) === closing) this.closings.delete(storageKey); });
    this.closings.set(storageKey, closing);
    return closing;
  }

  private async closeEntry(storageKey: string, entry: RuntimeEntry<Runtime>): Promise<boolean> {
    entry.state = "closing"; entry.observing.abort(this.host.running() ? hostErrors.project_closing("这个 Project 的 Local Host runtime 正在关闭") : new ActionError("actions.host_closed", "能力所在运行环境已关闭"));
    this.closingKeys.add(storageKey);
    try {
      await entry.operationTail;
      if (entry.activeUses > 0) {
        await new Promise<void>((resolve) => { entry.idleWaiters.push(resolve); });
      }
      return await closeOpened(entry.runtime, runtime => this.runtimeFactory.close(runtime, entry.reference));
    } finally {
      for (const dispose of entry.actionDisposers) dispose();
      if (this.entries.get(storageKey) === entry) this.entries.delete(storageKey);
      this.closingKeys.delete(storageKey);
    }
  }

  /**
   * Waits while the project is being put to sleep, so a call that comes then opens it again instead of being refused as closing. Nothing
   * is awaited otherwise: a call enters the project in the same turn it was made, as before.
   */
  awake(reference: LocalHostProjectReference): Promise<void> | undefined {
    const key = reference.storage_key.trim(), sleeping = this.sleeping.get(key);
    // A call from the project's own work, which its close may be waiting for, is refused as closing, as before: waiting would never end.
    if (!sleeping || this.scope.getStore()?.entry.reference.storage_key === key) return undefined;
    // Nor does any other call wait longer than a close takes; past that it is refused as closing too.
    return new Promise<void>(resolve => {
      const timer = setTimeout(resolve, AWAKE_WAIT_MS);
      timer.unref?.();
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      void sleeping.then(done, done);
    });
  }

  /**
   * Closes a project nobody has used for `idleMs` and that has nothing running (batch 103-1): no call in it or waiting for it, and
   * `hasLiveWork` (asked last, it may wait) says no work of it would end. Checked again just before closing; a call that comes while it
   * closes waits and opens it again (`awake`). Whether it was put to sleep.
   */
  async sleepIfIdle(storageKey: string, idleMs: number, hasLiveWork: () => Promise<boolean>): Promise<boolean> {
    const entry = this.entries.get(storageKey);
    const idle = () => !!entry && this.isReady(entry) && entry.activeUses === 0 && entry.queuedUses === 0 && Date.now() - entry.lastUsedAt >= idleMs;
    if (!idle()) return false;
    const usedAt = entry!.lastUsedAt;
    if (await hasLiveWork() || !idle() || entry!.lastUsedAt !== usedAt) return false;
    const purposeful = this.purposeful.get(storageKey);
    const closing = this.close(storageKey).then(closed => {
      // Closed on purpose meanwhile (deleted, restored, synced): it stays closed, not asleep.
      if (closed && this.purposeful.get(storageKey) === purposeful) {
        this.dismissed.delete(storageKey);
        this.rested.set(storageKey, usedAt);
      }
      return closed;
    });
    this.sleeping.set(storageKey, closing);
    try { return await closing; }
    finally { if (this.sleeping.get(storageKey) === closing) this.sleeping.delete(storageKey); }
  }

  /** Closes every project that is open now. */
  closeAll(): Promise<boolean[]> {
    return Promise.all([...this.entries.keys()].map(key => this.closeProject(key)));
  }
}
