import { ActionError, requireSynchronous, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PlacementPorts } from "@molis-ai/molis-work-service-placement";

/** Each invocation keeps its originating lifetime while opening the owner's authority over other partitions. */
export function placementCallPorts(ports: PlacementPorts, origin: ActionExecutionContext, alive: () => boolean): PlacementPorts {
  const assertCurrent = () => {
    if (!alive()) throw new ActionError("actions.expired", "原放置服务已关闭");
    origin.signal?.throwIfAborted();
    requireSynchronous(origin.assert_authority_current?.(), "最终授权检查必须同步完成");
  };
  return { ...ports,
    beforeEffect: async () => { await origin.beforeEffect(); assertCurrent(); },
    ledger: { ...ports.ledger, commands: new Proxy(ports.ledger.commands, { get(target, key) {
      const value: unknown = Reflect.get(target, key);
      return typeof value === "function" ? (...args: unknown[]) => { assertCurrent(); return Reflect.apply(value, target, args); } : value;
    } }) },
    titles: { get: (kind, id) => ports.titles.get(kind, id), set: (kind, id, title) => { assertCurrent(); ports.titles.set(kind, id, title); } },
    scope: async projectId => {
      const { client, caller } = await ports.scope(projectId);
      assertCurrent();
      return { client, caller: { ...caller,
        signal: caller.signal && origin.signal ? AbortSignal.any([caller.signal, origin.signal]) : origin.signal ?? caller.signal,
        validate_authority: async reference => { await origin.beforeEffect(); await caller.validate_authority?.(reference); },
        assert_authority_current: (reference, permissions) => {
          assertCurrent();
          requireSynchronous(caller.assert_authority_current?.(reference, permissions), "最终授权检查必须同步完成");
        },
      } };
    },
  };
}
