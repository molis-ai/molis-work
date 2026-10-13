import { requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import { AsyncLocalStorage } from "node:async_hooks";
import type { PrologueHost, Session } from "@prologue/sdk";
import type { AgentMemoryCapability, AgentMemoryExecutionControl, AgentStartExecution } from "@molis-ai/molis-work-contracts/services/agent-host";

/** Per-invocation SDK commit checks; accepted runs detach from the start call before driving background work. */
export function prologueEffects(host: PrologueHost) {
  const calls = new AsyncLocalStorage<{ control: AgentMemoryExecutionControl; active: boolean; accepted: boolean }>();
  const commit = <T>(write: () => Promise<T>): Promise<T> => {
    const frame = calls.getStore();
    if (!frame?.active) return write();
    return (async () => { await frame.control.beforeEffect(); requireSynchronous(frame.control.assert_current(), "最终授权检查必须同步完成"); return write(); })();
  };
  const storage: PrologueHost["storage"] = {
    get: input => host.storage.get(input), list: input => host.storage.list(input), readSecure: input => host.storage.readSecure(input),
    commit: input => commit(() => host.storage.commit(input)),
    commitBatch: inputs => commit(() => host.storage.commitBatch(inputs)),
    remove: input => commit(() => host.storage.remove(input)),
    purge: input => commit(() => host.storage.purge(input)),
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
  const start = <T>(execution: AgentStartExecution | undefined, work: () => Promise<T>): Promise<T> => {
    if (!execution?.beforeStart && !execution?.assertBeforeStart) return work();
    return call({ beforeEffect: () => execution.beforeStart?.(), assert_current: () => execution.assertBeforeStart?.() }, work);
  };
  const session = (target: Session): Session => new Proxy(target, { get(object, key) {
    if (key === "startRun") return (input: Parameters<Session["startRun"]>[0], drive?: Parameters<Session["startRun"]>[1]) => {
      const frame = calls.getStore(), accepted = () => { if (frame) { frame.accepted = true; frame.active = false; } };
      const run = object.startRun(input, drive ? context => { accepted(); return calls.exit(() => drive(context)); } : undefined);
      return run.then(result => { accepted(); return result; });
    };
    const value: unknown = Reflect.get(object, key); return typeof value === "function" ? value.bind(object) : value;
  } });
  return { host: { ...host, storage }, call, start, session, accepted: () => calls.getStore()?.accepted ?? false, detach: <T>(work: () => T) => calls.exit(work), bind: (memory: AgentMemoryCapability, control: AgentMemoryExecutionControl) => wrap(memory, control) };
}
