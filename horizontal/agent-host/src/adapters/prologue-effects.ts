import { requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import { AsyncLocalStorage } from "node:async_hooks";
import { agentErrors } from "../errors.js";
import type { Session, StorageGuard, StorageWriteContext } from "@prologue/sdk";
import type { NodeHost } from "./prologue-node-kit.js";
import type { AgentSessionWriteObservation, AgentMemoryCapability, AgentMemoryExecutionControl, AgentStartExecution } from "@molis-ai/molis-work-contracts/services/agent-host";

export interface PrologueEffects {
  readonly host: NodeHost;
  /** First-class SDK `ScopedStorage` guard observing logical unprefixed kinds (`sessions`, `memories`, `memory-candidates`). */
  readonly storageGuard: StorageGuard;
  call<T>(control: AgentMemoryExecutionControl, work: () => Promise<T>): Promise<T>;
  memory<T>(control: AgentMemoryExecutionControl | undefined, work: () => Promise<T>): Promise<T>;
  start<T>(execution: AgentStartExecution | undefined, work: () => Promise<T>): Promise<T>;
  bindStart(execution: AgentStartExecution): () => void;
  session(target: Session): Session;
  beforeEffect(): Promise<void>;
  assertCurrent(): void;
  accepted(): boolean;
  /** SDK continuation returned its durable accepted Run; background work releases the submitting invocation. */
  accept(): void;
  detach<T>(work: () => T): T;
  bind(memory: AgentMemoryCapability, control: AgentMemoryExecutionControl): AgentMemoryCapability;
  observeMemoryWrites(): () => void;
  observeSessionWrites(ids: readonly string[]): AgentSessionWriteObservation;
  close(): void;
}

/** Per-invocation SDK commit checks; accepted runs detach from the start call before driving background work. */
export function prologueEffects(host: NodeHost): PrologueEffects {
  const observers = new Set<{ keys: ReadonlySet<string>; invalid: boolean; closed: boolean }>();
  const pending = new Map<string, number>();
  let closed = false;
  const observeSessionWrites = (ids: readonly string[]): AgentSessionWriteObservation => {
    if (closed) throw agentErrors.capability_unavailable("执行会话写观察已关闭");
    const observation = { keys: new Set(ids), invalid: ids.some(id => pending.has(id)), closed: false };
    observers.add(observation);
    return { assert_current() {
      if (closed || observation.closed || observation.invalid) throw agentErrors.memory_read_changed("实际来源会话在本次准备后已改变，旧来源不能继续提交");
    }, dispose() { observation.closed = true; observers.delete(observation); } };
  };
  const calls = new AsyncLocalStorage<{ control: AgentMemoryExecutionControl; active: boolean; accepted: boolean; memory?: true }>();
  let memoryWrites = 0, writingMemory = 0;
  const isMemoryKind = (kind: string) => kind === "memories" || kind === "memory-candidates";
  const observeMemoryWrites = () => {
    const observed = memoryWrites;
    const unchanged = () => {
      if (writingMemory !== 0 || memoryWrites !== observed)
        throw agentErrors.memory_read_changed("读取期间记忆存储发生写入，不能接受过期的固定选择");
    };
    unchanged(); return unchanged;
  };
  const beforeEffect = async () => { const frame = calls.getStore(); if (frame?.active) await frame.control.beforeEffect(); };
  const assertCurrent = () => { const frame = calls.getStore(); if (frame?.active) requireSynchronous(frame.control.assert_current(), "最终授权检查必须同步完成"); };
  const memoryTrackers = new WeakMap<StorageWriteContext, () => void>();
  const storageGuard: StorageGuard = {
    onWriteStart(context) {
      const hasSession = context.entries.some(entry => entry.kind === "sessions");
      const hasMemory = context.entries.some(entry => isMemoryKind(entry.kind));
      if (!hasSession && !hasMemory) return undefined;
      const sessionIds = hasSession ? new Set(context.entries.filter(entry => entry.kind === "sessions").map(entry => entry.id)) : undefined;
      if (sessionIds) {
        for (const id of sessionIds) pending.set(id, (pending.get(id) ?? 0) + 1);
        for (const observation of observers) if ([...sessionIds].some(id => observation.keys.has(id))) observation.invalid = true;
      }
      let trackedMemory = false;
      if (hasMemory) {
        memoryTrackers.set(context, () => {
          if (trackedMemory) return;
          trackedMemory = true;
          memoryWrites++;
          writingMemory++;
        });
      }
      return () => {
        if (sessionIds) {
          for (const id of sessionIds) {
            const count = pending.get(id)! - 1;
            if (count) pending.set(id, count); else pending.delete(id);
          }
        }
        if (trackedMemory) { writingMemory--; memoryWrites++; }
      };
    },
    beforeWrite(context) {
      const frame = calls.getStore();
      const trackMemory = memoryTrackers.get(context);
      if (!frame?.active) return trackMemory ? () => { trackMemory(); } : undefined;
      // Only Memory's put/remove follows its canonical authorization without reopening an asynchronous window.
      if (frame.memory && (context.operation === "commit" || context.operation === "remove")) {
        assertCurrent();
        return () => { assertCurrent(); trackMemory?.(); };
      }
      return beforeEffect().then(() => () => { assertCurrent(); trackMemory?.(); });
    },
  };
  const commitApp = <T>(write: () => Promise<T>): Promise<T> => {
    if (!calls.getStore()?.active) return write();
    return (async () => { await beforeEffect(); assertCurrent(); return write(); })();
  };
  const storage: NodeHost["storage"] = {
    ...(host.storage.mountMemory === undefined ? {} : { mountMemory: host.storage.mountMemory.bind(host.storage) }),
    ...(host.storage.observations === undefined ? {} : { observations: host.storage.observations.bind(host.storage) }),
    get: input => host.storage.get(input), list: input => host.storage.list(input), readSecure: input => host.storage.readSecure(input),
    commit: input => commitApp(() => host.storage.commit(input)),
    commitBatch: inputs => commitApp(() => host.storage.commitBatch(inputs)),
    ...(host.storage.commitGuarded === undefined ? {} : {
      commitGuarded: (inputs, check) => commitApp(() => host.storage.commitGuarded!(inputs, check)),
    }),
    remove: input => commitApp(() => host.storage.remove(input)),
    purge: input => commitApp(() => host.storage.purge(input)),
    discard: input => commitApp(() => host.storage.discard(input)),
  };
  const wrap = <T extends object>(target: T, control: AgentMemoryExecutionControl): T => new Proxy(target, {
    get(object, key) {
      const value: unknown = Reflect.get(object, key);
      if (key === "candidates" && value && typeof value === "object") return wrap(value, control);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => calls.run({ control, active: true, accepted: false }, () => Reflect.apply(value, object, args));
    },
  });
  const call = <T>(control: AgentMemoryExecutionControl, work: () => Promise<T>): Promise<T> => {
    const frame = { control, active: true, accepted: false };
    return calls.run(frame, work);
  };
  const memory = <T>(control: AgentMemoryExecutionControl | undefined, work: () => Promise<T>): Promise<T> => {
    const inherited = calls.getStore(), original = control ?? (inherited?.active ? inherited.control : undefined);
    if (!original) return work();
    // Every facade invocation owns its frame; a nested ordinary call never inherits the Memory marker.
    return calls.run({ control: original, active: true, accepted: false, memory: true }, work);
  };
  const start = <T>(execution: AgentStartExecution | undefined, work: () => Promise<T>): Promise<T> => {
    if (!execution?.beforeStart && !execution?.assertBeforeStart && !execution?.delegation) {
      const inherited = calls.getStore();
      return inherited?.active && inherited.memory ? call(inherited.control, work) : work();
    }
    return call({ beforeEffect: () => execution.beforeStart?.(), assert_current: () => execution.assertBeforeStart?.() }, work);
  };
  const bindStart = (execution: AgentStartExecution) => {
    const frame = calls.getStore();
    if (!frame || !frame.active) throw new Error("缺少原执行启动授权");
    const before = frame.control;
    frame.control = { beforeEffect: () => execution.beforeStart?.(), assert_current: () => execution.assertBeforeStart?.() };
    return () => { frame.control = before; };
  };
  const session = (target: Session): Session => new Proxy(target, { get(object, key) {
    // Everything after `drive` goes through as given: `carry` there names the session's waiting supplements the run takes (specs/ai-input-receipts D29).
    if (key === "startRun") return (input: Parameters<Session["startRun"]>[0], drive?: Parameters<Session["startRun"]>[1], options?: Parameters<Session["startRun"]>[2]) => {
      const frame = calls.getStore(), accepted = () => { if (frame) { frame.accepted = true; frame.active = false; } };
      const run = object.startRun(input, drive ? context => { accepted(); return calls.exit(() => drive(context)); } : undefined, options);
      return run.then(result => { accepted(); return result; });
    };
    const value: unknown = Reflect.get(object, key); return typeof value === "function" ? value.bind(object) : value;
  } });
  return { observeSessionWrites, close() { closed = true; for (const observation of observers) observation.closed = true; observers.clear(); }, host: { ...host, storage }, storageGuard, call, memory, start, bindStart, session, beforeEffect, assertCurrent, observeMemoryWrites, accepted: () => calls.getStore()?.accepted ?? false,
    accept() { const frame = calls.getStore(); if (frame) { frame.accepted = true; frame.active = false; } },
    detach: <T>(work: () => T) => calls.exit(work), bind: (memory: AgentMemoryCapability, control: AgentMemoryExecutionControl) => wrap(memory, control) };
}
