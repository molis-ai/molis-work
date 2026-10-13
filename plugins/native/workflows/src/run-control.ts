import { ActionError, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { WorkflowsActionPorts } from "./actions.js";

/** Transient controls for calls on this provider. Durable instance status fences commits after restart as well. */
export function createWorkflowRunControls(projectId: string, withStore: WorkflowsActionPorts["withStore"]) {
  const running = new Map<string, Set<AbortController>>();
  return {
    acquire(id: string, original: ActionExecutionContext) {
      const controller = new AbortController();
      const calls = running.get(id) ?? new Set<AbortController>();
      calls.add(controller); running.set(id, calls);
      const signal = original.signal ? AbortSignal.any([original.signal, controller.signal]) : controller.signal;
      const caller: ActionExecutionContext = { ...original, signal, assert_authority_current: (reference, requiredPermissions) => {
        original.assert_authority_current?.(reference, requiredPermissions); signal.throwIfAborted();
      }, beforeEffect: async () => {
        await original.beforeEffect(); signal.throwIfAborted();
        const status = await withStore(store => store.instance(id, projectId).status);
        if (status === "stopped") throw new ActionError("actions.cancelled", "这一次已结束，未提交的步骤已取消");
        original.assert_authority_current?.(); signal.throwIfAborted();
      } };
      return { caller, release() { calls.delete(controller); if (!calls.size) running.delete(id); } };
    },
    stop(id: string) {
      for (const controller of running.get(id) ?? []) controller.abort(new ActionError("actions.cancelled", "这一次已结束，未提交的步骤已取消"));
    },
  };
}
