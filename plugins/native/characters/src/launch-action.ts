import { requireSynchronous, type ActionDefinition, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { bindOwnerPluginAction } from "@molis-ai/molis-work-plugin-sdk";
import type { CharacterLaunchControl } from "./imports.js";

/** Keep the owner binder's original caller through the native launch's final await. */
export function bindCharacterLaunch<Input, Output>(context: PluginStartContext, definition: ActionDefinition<Input, Output>,
  launch: (input: Input, control: CharacterLaunchControl) => Output | Promise<Output>): ActionHandlerBinding {
  const binding = bindOwnerPluginAction(context, definition, async () => { throw new Error("缺少原调用控制"); });
  return { ...binding, handle: (caller, input) => bindOwnerPluginAction(context, definition, (value, beforeStart) => launch(value, {
    beforeStart, assert_current: () => {
      caller.signal?.throwIfAborted();
      requireSynchronous(caller.assert_authority_current?.(), "最终授权检查必须同步完成");
    },
  })).handle(caller, input) };
}
