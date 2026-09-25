import type {
  PluginAppContribution,
  PluginDefinition,
  PluginStartContext,
} from "@molis-ai/molis-work-contracts/platform/plugin";

import { textStatsManifest } from "./manifest.js";
import { textStatsUiContribution } from "./ui.js";
import { bindPluginActionRoute } from "@molis-ai/molis-work-contracts/platform/actions";
import { textStatsActions, textStatsActionHandlers } from "./actions.js";

export interface TextStatsPluginPorts {
  /** Called with the bound snapshot, or null when the input went away. */
  onSnapshot?(input: { content: unknown; source_plugin_id: string; content_version: number } | null): void;
  onStop?(context: PluginStartContext): void | Promise<void>;
}

export function createTextStatsPlugin(ports: TextStatsPluginPorts = {}): PluginDefinition {
  return {
    manifest: textStatsManifest,
    async start(context: PluginStartContext): Promise<PluginAppContribution> {
      for (const permission of textStatsManifest.permissions) {
        if (permission.required) context.requireGrant(permission.permission);
      }
      return {
        kind: "app",
        views: [textStatsUiContribution],
        actions: textStatsActionHandlers(context),
        routes: [bindPluginActionRoute(context, textStatsActions.state, () => ({}))],
        onUpstreamReady: (inputs) => {
          const record = inputs.text;
          // An Artifact the Host could not make available is not an input.
          // Counting its `payload` — which is null in that case — would report
          // zeros for a file nobody managed to read.
          if (record === undefined || record.availability !== "available" || record.lifecycle_state !== "active") {
            ports.onSnapshot?.(null);
            return;
          }
          ports.onSnapshot?.({
            content: record.payload,
            source_plugin_id: record.producer_plugin_id,
            content_version: record.version,
          });
        },
        onUpstreamUnavailable: () => {
          // The counts are cleared rather than left on screen: numbers that no
          // longer correspond to anything readable are worse than no numbers.
          ports.onSnapshot?.(null);
        },
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
