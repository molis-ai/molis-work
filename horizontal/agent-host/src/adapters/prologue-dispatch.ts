import { requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { CommandDispatchGuard } from "@prologue/sdk/node";
import { agentErrors } from "../errors.js";
import type { DispatchControl, DispatchGuards } from "./prologue-node-kit.js";

/** Nested calls retain both original owners; a later check cannot replace the initiating Run's fence. */
export function withDispatchControl<T>(guards: DispatchGuards, control: DispatchControl, operation: () => Promise<T>): Promise<T> {
  const inherited = guards.getStore();
  const assertCurrent = () => {
    requireSynchronous(inherited?.assertCurrent());
    requireSynchronous(control.assertCurrent());
  };
  const prepareDispatch = async () => {
    const outer = await prepareDispatchFence(inherited);
    const inner = await prepareDispatchFence(control);
    return () => {
      requireSynchronous(outer?.());
      requireSynchronous(inner?.());
    };
  };
  return guards.run({
    assertCurrent,
    mcp: control.mcp ?? inherited?.mcp,
    prepareDispatch,
    beforeEffect: async () => {
      const fence = await prepareDispatch();
      fence();
    },
  }, operation);
}

export async function prepareDispatchFence(control: DispatchControl | undefined) {
  if (!control) return;
  if (control.prepareDispatch) return control.prepareDispatch();
  await control.beforeEffect();
  return () => requireSynchronous(control.assertCurrent());
}

/** NodeHost `beforeCommandDispatch` port: gates foreground, background, and interactive spawns fail-closed with a final sync fence. */
export function createCommandDispatchGuard(guards: DispatchGuards): CommandDispatchGuard {
  return async (context) => {
    if (context.kind === "run" && !context.commandId) {
      throw agentErrors.review_not_permitted("命令缺少原调用标识或正在准备同一条命令");
    }
    const control = guards.getStore();
    if (!control) {
      throw agentErrors.review_not_permitted("执行缺少原调用的授权检查");
    }
    if (context.kind === "interactive") {
      const transport = control.mcp?.maintenance;
      if (transport?.kind === "stdio") {
        requireSynchronous(control.assertCurrent());
        requireSynchronous(transport.control.assertCurrent());
        return () => {
          requireSynchronous(control.assertCurrent());
          requireSynchronous(transport.control.assertCurrent());
        };
      }
    }
    requireSynchronous(control.assertCurrent());
    await control.beforeEffect();
    return () => requireSynchronous(control.assertCurrent());
  };
}
