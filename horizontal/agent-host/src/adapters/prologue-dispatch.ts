import { requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import { createPrologueError } from "@prologue/sdk";
import { agentErrors } from "../errors.js";
import type { ReviewDecisionControl } from "../review-decisions.js";
import type { DispatchGuards, NodeHost } from "./prologue-node-kit.js";

/** Nested calls retain both original owners; a later check cannot replace the initiating Run's fence. */
export function withDispatchControl<T>(guards: DispatchGuards, control: ReviewDecisionControl, operation: () => Promise<T>): Promise<T> {
  const inherited = guards.getStore();
  const assertCurrent = () => { requireSynchronous(inherited?.assertCurrent()); requireSynchronous(control.assertCurrent()); };
  return guards.run({ assertCurrent, beforeEffect: async () => {
    await inherited?.beforeEffect(); await control.beforeEffect();
  } }, operation);
}

/** The existing Node Host owns each command. Its spawn path has no await after this final check. */
export function guardNodeDispatch<Host extends Pick<NodeHost, "runCommand" | "startBackgroundCommand" | "cancelCommand">>(host: Host, guards: DispatchGuards): Host {
  const preparing = new Map<string, { cancelled: boolean }>();
  const current = () => {
    const control = guards.getStore();
    if (!control) throw agentErrors.review_not_permitted("执行缺少原调用的授权检查");
    requireSynchronous(control.assertCurrent());
    return control;
  };
  const dispatch = async <T>(operation: () => Promise<T>): Promise<T> => {
    const control = current();
    await control.beforeEffect(); requireSynchronous(control.assertCurrent());
    return operation();
  };
  return { ...host,
    async runCommand(input: Parameters<NodeHost["runCommand"]>[0]) {
      const id = input.commandId;
      if (!id || preparing.has(id)) throw agentErrors.review_not_permitted("命令缺少原调用标识或正在准备同一条命令");
      const pending = { cancelled: false }, control = current();
      preparing.set(id, pending);
      try {
        await control.beforeEffect(); requireSynchronous(control.assertCurrent());
        if (pending.cancelled) throw createPrologueError("CANCELLED", "The original command was cancelled before dispatch.");
        preparing.delete(id);
        return host.runCommand(input);
      } finally { if (preparing.get(id) === pending) preparing.delete(id); }
    },
    startBackgroundCommand: (input: Parameters<NodeHost["startBackgroundCommand"]>[0]) => dispatch(() => host.startBackgroundCommand(input)),
    cancelCommand(id: string) {
      const pending = preparing.get(id); if (pending) pending.cancelled = true;
      return host.cancelCommand(id);
    },
  };
}
