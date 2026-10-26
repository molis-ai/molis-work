import { AsyncLocalStorage } from "node:async_hooks";
import type { HostCapabilityDescriptor, LocalHostProjectReference, LocalHostStatus } from "@molis-ai/molis-work-contracts/platform/app-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { hostErrors } from "./host-errors.js";
import { hostLog } from "./host-log.js";
import type { LocalHostRuntimeFactory } from "./local-host-types.js";

/** How long one queued project operation may hold everything else of the project before the log names it. */
const HELD_IN_LINE_WARN_MS = 20_000;

export interface RuntimeEntry<Runtime> {
  reference: LocalHostProjectReference;
  runtime: Promise<Runtime>;
  state: "opening" | "ready" | "closing";
  operationTail: Promise<void>;
  activeUses: number;
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
  /** Whether the registered action runs beside the line (scheduling "concurrent"): read from the registry, never from the caller. */
  concurrent(capability: Pick<HostCapabilityDescriptor, "capability_id" | "version" | "action_provider">): boolean;
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

  isClosing(storageKey: string): boolean {
    return this.closingKeys.has(storageKey);
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
    this.assertCompatibleReference(normalized);
    if (this.closingKeys.has(normalized.storage_key)) {
      throw hostErrors.project_closing("这个 Project 的 Local Host runtime 正在关闭");
    }
    const existing = this.entries.get(normalized.storage_key);
    if (existing) {
      assertSameIdentity(existing.reference, normalized);
      return existing;
    }
    const entry: RuntimeEntry<Runtime> = {
      reference: normalized,
      runtime: Promise.resolve().then(() => this.runtimeFactory.open(normalized)),
      state: "opening",
      operationTail: Promise.resolve(),
      activeUses: 0,
      idleWaiters: [], observing: new AbortController(),
      actionDisposers: new Set(),
    };
    this.entries.set(normalized.storage_key, entry);
    entry.runtime.then(
      () => { if (entry.state === "opening") entry.state = "ready"; },
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
    // state (a model draft): held in line, each would keep every later operation of the project waiting until it answers. They run beside the queue; withRuntime keeps close
    // waiting; callSignal cancels these executions as closing starts, before waiting for their cleanup.
    // Concurrency is read from the registered descriptor, never from the caller.
    if (this.host.concurrent(capability)) return this.withRuntime(reference, () => run(false));
    const operation = entry.operationTail.then(heldInLine);
    entry.operationTail = operation.then(() => undefined, () => undefined);
    return await operation;
  }

  /** Direct composition port for Host code that works inside one project's runtime. */
  async withRuntime<Result>(
    reference: LocalHostProjectReference,
    operation: (runtime: Runtime) => Result | Promise<Result>,
  ): Promise<Result> {
    const entry = this.ensureEntry(reference);
    entry.activeUses += 1;
    try {
      return await operation(await entry.runtime);
    } finally {
      entry.activeUses -= 1;
      if (entry.activeUses === 0) {
        for (const resolve of entry.idleWaiters.splice(0)) resolve();
      }
    }
  }

  /** Current project states, owned by the caller; listing projects never copies the capability directory. */
  projects(): LocalHostStatus["projects"] {
    return [...this.entries.values()]
      .map((entry) => ({ ...entry.reference, state: entry.state }))
      .sort((left, right) => left.storage_key.localeCompare(right.storage_key));
  }

  async closeProject(referenceOrStorageKey: LocalHostProjectReference | string): Promise<boolean> {
    const storageKey = typeof referenceOrStorageKey === "string"
      ? referenceOrStorageKey.trim()
      : normalizeReference(referenceOrStorageKey).storage_key;
    const entry = this.entries.get(storageKey);
    if (!entry) return false;
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

  /** Closes every project that is open now. */
  closeAll(): Promise<boolean[]> {
    return Promise.all([...this.entries.keys()].map(key => this.closeProject(key)));
  }
}
