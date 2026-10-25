import type {
  PluginAppContribution,
  PluginDefinition,
  PluginStartContext,
} from "@molis-ai/molis-work-contracts/platform/plugin";

import { diffManifest } from "./manifest.js";
import { diffUiContribution } from "./ui.js";
import { bindPluginActionRoute } from "@molis-ai/molis-work-plugin-sdk";
import { diffActions, diffActionHandlers } from "./actions.js";

/**
 * Diff as Plugin Runtime starts it.
 *
 * The selected input group arrives on the start context and is not something
 * the Plugin chooses: the Host validated it against the bindings before
 * activation, so Diff renders the group it was given rather than guessing from
 * whichever port happens to hold a value.
 */
export interface DiffPluginPorts {
  onGroupSelected?(group: string | undefined): void | Promise<void>;
  onStop?(context: PluginStartContext): void | Promise<void>;
}

export function createDiffPlugin(ports: DiffPluginPorts = {}): PluginDefinition {
  return {
    manifest: diffManifest,
    async start(context: PluginStartContext): Promise<PluginAppContribution> {
      for (const permission of diffManifest.permissions) {
        if (permission.required) context.requireGrant(permission.permission);
      }
      await ports.onGroupSelected?.(context.input_group);
      return {
        kind: "app",
        views: [diffUiContribution],
        actions: diffActionHandlers(context),
        routes: [bindPluginActionRoute(context, diffActions.state, request => ({
          ...(request.query.artifact_id === undefined ? {} : { reference: { artifact_id: request.query.artifact_id, version: Number(request.query.version) } }),
          ...(request.query.change_index === undefined ? {} : { change_index: Number(request.query.change_index) }),
        }))],
        onUpstreamReady: () => {},
        onUpstreamUnavailable: () => {},
      };
    },
    async stop(context: PluginStartContext): Promise<void> {
      await ports.onStop?.(context);
    },
    async health(): Promise<{ ok: boolean; message: string }> {
      return { ok: true, message: "就绪" };
    },
  };
}
