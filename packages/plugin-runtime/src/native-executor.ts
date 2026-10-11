import type { PluginDefinition, PluginExecutor, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";

export class NativePluginExecutor implements PluginExecutor {
  async start(definition: PluginDefinition, context: PluginStartContext) {
    return { contribution: await definition.start(context) };
  }

  async stop(definition: PluginDefinition, context: PluginStartContext): Promise<void> {
    await definition.stop?.(context);
  }
}
