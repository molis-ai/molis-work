import { requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import { AsyncLocalStorage } from "node:async_hooks";
import { agentErrors } from "../errors.js";
import type { PrologueHost, Session } from "@prologue/sdk";
import type { AgentSessionWriteObservation, AgentMemoryCapability, AgentMemoryExecutionControl, AgentStartExecution } from "@molis-ai/molis-work-contracts/services/agent-host";

export interface PrologueEffects {
  readonly host: PrologueHost;
  call<T>(control: AgentMemoryExecutionControl, work: () => Promise<T>): Promise<T>;
  memory<T>(control: AgentMemoryExecutionControl | undefined, work: () => Promise<T>): Promise<T>;
  start<T>(execution: AgentStartExecution | undefined, work: () => Promise<T>): Promise<T>;
  session(target: Session): Session;
  beforeEffect(): Promise<void>;
  assertCurrent(): void;
  accepted(): boolean;
  detach<T>(work: () => T): T;
  bind(memory: AgentMemoryCapability, control: AgentMemoryExecutionControl): AgentMemoryCapability;
  observeMemoryWrites(): () => void;
  observeSessionWrites(ids: readonly string[]): AgentSessionWriteObservation;
  close(): void;
}

/** Per-invocation SDK commit checks; accepted runs detach from the start call before driving background work. */
export function prologueEffects(host: PrologueHost, appId: string): PrologueEffects {
  const observers = new Set<{ keys: ReadonlySet<string>; invalid: boolean; closed: boolean }>();
  const pending = new Map<string, number>();
  const sessionKind = appId + "~sessions";
  let closed = false;
  const observeSessionWrites = (ids: readonly string[]): AgentSessionWriteObservation => {
    if (closed) throw agentErrors.capability_unavailable("执行会话写观察已关闭");
    const observation = { keys: new Set(ids), invalid: ids.some(id => pending.has(id)), closed: false };
    observers.add(observation);
    return { assert_current() {
      if (closed || observation.closed || observation.invalid) throw agentErrors.memory_read_changed("实际来源会话在本次准备后已改变，旧来源不能继续提交");
    }, dispose() { observation.closed = true; observers.delete(observation); } };
  };
  const sessionWrite = async <T>(inputs: readonly { kind: string; id: string }[], write: () => Promise<T>): Promise<T> => {
    const ids = new Set(inputs.filter(input => input.kind === sessionKind).map(input => input.id));
    for (const id of ids) pending.set(id, (pending.get(id) ?? 0) + 1);
    for (const observation of observers) if ([...ids].some(id => observation.keys.has(id))) observation.invalid = true;
    try { return await write(); }
    finally { for (const id of ids) { const count = pending.get(id)! - 1; if (count) pending.set(id, count); else pending.delete(id); } }
  };
  const calls = new AsyncLocalStorage<{ control: AgentMemoryExecutionControl; active: boolean; accepted: boolean; memory?: true }>();
  let memoryWrites = 0, writingMemory = 0;
  const memoryKind = (kind: string) => /(?:^|~)(?:memories|memory-candidates)$/u.test(kind);
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
  const trackedWrite = <T>(memory: boolean, write: () => Promise<T>): Promise<T> => {
    if (!memory) return write();
    memoryWrites++; writingMemory++;
    return (async () => { try { return await write(); } finally { writingMemory--; memoryWrites++; } })();
  };
  const commit = <T>(memory: boolean, write: () => Promise<T>): Promise<T> => {
    if (!calls.getStore()?.active) return trackedWrite(memory, write);
    return (async () => { await beforeEffect(); assertCurrent(); return trackedWrite(memory, write); })();
  };
  // Only Memory's put/remove follows its canonical authorization without reopening an asynchronous window.
  const memoryCommit = <T>(memory: boolean, write: () => Promise<T>): Promise<T> => {
    if (calls.getStore()?.active && calls.getStore()?.memory) { assertCurrent(); return trackedWrite(memory, write); }
    return commit(memory, write);
  };
  const storage: PrologueHost["storage"] = {
    ...(host.storage.mountMemory === undefined ? {} : { mountMemory: host.storage.mountMemory.bind(host.storage) }),
    ...(host.storage.observations === undefined ? {} : { observations: host.storage.observations.bind(host.storage) }),
    get: input => host.storage.get(input), list: input => host.storage.list(input), readSecure: input => host.storage.readSecure(input),
    commit: input => sessionWrite([input], () => memoryCommit(memoryKind(input.kind), () => host.storage.commit(input))),
    commitBatch: inputs => sessionWrite(inputs, () => commit(inputs.some(input => memoryKind(input.kind)), () => host.storage.commitBatch(inputs))),
    remove: input => sessionWrite([input], () => memoryCommit(memoryKind(input.kind), () => host.storage.remove(input))),
    purge: input => sessionWrite([input], () => commit(memoryKind(input.kind), () => host.storage.purge(input))),
    discard: input => sessionWrite([input], () => commit(memoryKind(input.kind), () => host.storage.discard(input))),
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
    if (!execution?.beforeStart && !execution?.assertBeforeStart) {
      const inherited = calls.getStore();
      return inherited?.active && inherited.memory ? call(inherited.control, work) : work();
    }
    return call({ beforeEffect: () => execution.beforeStart?.(), assert_current: () => execution.assertBeforeStart?.() }, work);
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
  return { observeSessionWrites, close() { closed = true; for (const observation of observers) observation.closed = true; observers.clear(); }, host: { ...host, storage }, call, memory, start, session, beforeEffect, assertCurrent, observeMemoryWrites, accepted: () => calls.getStore()?.accepted ?? false, detach: <T>(work: () => T) => calls.exit(work), bind: (memory: AgentMemoryCapability, control: AgentMemoryExecutionControl) => wrap(memory, control) };
}
