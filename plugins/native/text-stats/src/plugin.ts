import type {
  PluginAppContribution,
  PluginDefinition,
  PluginStartContext,
} from "@molis-ai/molis-work-contracts/platform/plugin";

import { textStatsManifest } from "./manifest.js";
import { textStatsUiContribution } from "./ui.js";
import { parseFileSnapshot } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { projectTextStats, waitingStats, unavailableStats } from "./core.js";

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
        routes: [{ route_id: "text-stats.state", handle: () => {
          const record = context.services?.inputs?.read("text");
          if (!record) return { status: 200, body: { view: waitingStats() } };
          try { return { status: 200, body: { view: projectTextStats({ snapshot: parseFileSnapshot(record.payload),
            source_plugin_id: record.producer_plugin_id, content_version: record.version }) } }; }
          catch { return { status: 200, body: { view: unavailableStats() } }; }
        } }],
        onUpstreamReady: (inputs) => {
          const record = inputs.text;
          // An Artifact the Host could not make available is not an input.
          // Counting its `payload` — which is null in that case — would report
          // zeros for a file nobody managed to read.
          if (record === undefined || record.availability !== "available") {
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
