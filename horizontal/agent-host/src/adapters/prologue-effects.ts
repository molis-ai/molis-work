import { requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import { AsyncLocalStorage } from "node:async_hooks";
import { createPrologueError, type PrologueHost, type Session } from "@prologue/sdk";
import type { AgentMemoryCapability, AgentMemoryExecutionControl, AgentStartExecution } from "@molis-ai/molis-work-contracts/services/agent-host";

export interface PrologueEffects {
  readonly host: PrologueHost;
  call<T>(control: AgentMemoryExecutionControl, work: () => Promise<T>): Promise<T>;
  memory<T>(control: AgentMemoryExecutionControl, work: () => Promise<T>, signal?: AbortSignal): Promise<T>;
  start<T>(execution: AgentStartExecution | undefined, work: () => Promise<T>): Promise<T>;
  admit<T>(current: () => void, work: () => Promise<T>): Promise<T>;
  session(target: Session): Session;
  beforeEffect(): Promise<void>;
  assertCurrent(): void;
  accepted(): boolean;
  detach<T>(work: () => T): T;
  bind(memory: AgentMemoryCapability, control: AgentMemoryExecutionControl): AgentMemoryCapability;
}

/** Per-invocation SDK commit checks; accepted runs detach from the start call before driving background work. */
export function prologueEffects(host: PrologueHost): PrologueEffects {
  const calls = new AsyncLocalStorage<{ control: AgentMemoryExecutionControl; active: boolean; accepted: boolean; memory: boolean; signal?: AbortSignal; admission?: () => void }>();
  const beforeEffect = async () => {
    const frame = calls.getStore();
    if (!frame?.active) return;
    const signal = frame.signal;
    const cancelled = () => createPrologueError("CANCELLED", "Memory promotion cancelled before authorization completed.");
    if (signal?.aborted) throw cancelled();
    if (!signal) { await frame.control.beforeEffect(); return; }
    let onAbort!: () => void;
    const cancellation = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(cancelled());
      signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      // Only authorization may finish late; never race a Host commit or the whole promotion.
      // Promise.race also consumes a late rejection from the authorization promise.
      await Promise.race([cancellation, Promise.resolve().then(() => {
        if (signal.aborted) throw cancelled();
        return frame.control.beforeEffect();
      })]);
      if (signal.aborted) throw cancelled();
    } finally { signal.removeEventListener("abort", onAbort); }
  };
  const assertCurrent = () => { const frame = calls.getStore(); if (frame?.active) { frame.admission?.(); requireSynchronous(frame.control.assert_current(), "最终授权检查必须同步完成"); } };
  const commit = <T>(write: () => Promise<T>): Promise<T> => {
    if (!calls.getStore()?.active) return write();
    // Memory's async gate runs before SDK authorization. Do not reopen an async window
    // after the SDK has checked the exact target's final authority fence.
    if (calls.getStore()?.memory) { assertCurrent(); return write(); }
    return (async () => { await beforeEffect(); assertCurrent(); return write(); })();
  };
  const storage: PrologueHost["storage"] = {
    ...(host.storage.readObservations ? { readObservations: host.storage.readObservations } : {}),
    get: input => host.storage.get(input), list: input => host.storage.list(input), readSecure: input => host.storage.readSecure(input),
    commit: input => commit(() => host.storage.commit(input)),
    commitBatch: inputs => commit(() => host.storage.commitBatch(inputs)),
    remove: input => commit(() => host.storage.remove(input)),
    purge: input => commit(() => host.storage.purge(input)),
    discard: input => commit(() => host.storage.discard(input)),
  };
  const wrap = <T extends object>(target: T, control: AgentMemoryExecutionControl): T => new Proxy(target, {
    get(object, key) {
      const value: unknown = Reflect.get(object, key);
      if (key === "candidates" && value && typeof value === "object") return wrap(value, control);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => call(control, () => Reflect.apply(value, object, args), true);
    },
  });
  const call = <T>(control: AgentMemoryExecutionControl, work: () => Promise<T>, memory = false, signal?: AbortSignal): Promise<T> => {
    const frame = { control, active: true, accepted: false, memory, signal };
    return calls.run(frame, work);
  };
  const start = <T>(execution: AgentStartExecution | undefined, work: () => Promise<T>): Promise<T> => {
    if (!execution?.beforeStart && !execution?.assertBeforeStart) return work();
    return call({ beforeEffect: () => execution.beforeStart?.(), assert_current: () => execution.assertBeforeStart?.() }, work);
  };
  const admit = <T>(current: () => void, work: () => Promise<T>): Promise<T> => {
    const inherited = calls.getStore(); current();
    return calls.run({ control: inherited?.control ?? { beforeEffect() {}, assert_current() {} }, active: true,
      accepted: false, memory: false, admission: () => { inherited?.admission?.(); current(); } }, work);
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
  return { host: { ...host, storage }, call, memory: (control, work, signal) => call(control, work, true, signal), start, admit, session, beforeEffect, assertCurrent, accepted: () => calls.getStore()?.accepted ?? false, detach: <T>(work: () => T) => calls.exit(work), bind: (memory: AgentMemoryCapability, control: AgentMemoryExecutionControl) => wrap(memory, control) };
}
