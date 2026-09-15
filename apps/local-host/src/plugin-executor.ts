import type { ArtifactsApplicationApi } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { PluginDefinition, PluginExecutor, PluginManifest, PluginPrivateStorage, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { UiHostApi } from "@molis-ai/molis-work-contracts/platform/ui";
import { createPluginArtifactClient } from "@molis-ai/molis-work-plugin-artifacts";
import { createPluginUiClient } from "@molis-ai/molis-work-ui-host";

export interface PluginHostExecutorOptions {
  board_id: string;
  actor_id: string;
  artifacts: ArtifactsApplicationApi;
  ui: UiHostApi;
  privateStorageFor(context: PluginStartContext, manifest: PluginManifest): PluginPrivateStorage;
}

/** Trusted in-process Host composition, not an isolation boundary for arbitrary JavaScript. */
export class PluginHostExecutor implements PluginExecutor {
  private readonly sessions = new Map<string, { context: PluginStartContext; dispose(): void }>();
  constructor(private readonly options: PluginHostExecutorOptions) {}

  async start(definition: PluginDefinition, context: PluginStartContext) {
    const ui = createPluginUiClient(this.options.ui, context, definition.manifest);
    const hostedContext: PluginStartContext = Object.freeze({ ...context, services: Object.freeze({
      storage: definition.manifest.permissions.some(item => item.permission === "storage:private")
        ? this.options.privateStorageFor(context, definition.manifest) : undefined,
      artifacts: createPluginArtifactClient({ api: this.options.artifacts, manifest: definition.manifest, context,
        board_id: this.options.board_id, actor_id: this.options.actor_id }),
      ui: ui.client,
    }) });
    try {
      const contribution = await definition.start(hostedContext);
      this.sessions.set(context.install_id, { context: hostedContext, dispose: ui.dispose });
      return { contribution };
    } catch (error) {
      ui.dispose();
      throw error;
    }
  }

  async stop(definition: PluginDefinition, context: PluginStartContext): Promise<void> {
    const session = this.sessions.get(context.install_id);
    try {
      await definition.stop?.(session?.context ?? context);
    } finally {
      session?.dispose();
      this.sessions.delete(context.install_id);
    }
  }
}
