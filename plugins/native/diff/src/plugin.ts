import type {
  PluginAppContribution,
  PluginDefinition,
  PluginStartContext,
} from "@molis-ai/molis-work-contracts/platform/plugin";

import { diffManifest } from "./manifest.js";
import { diffUiContribution } from "./ui.js";
import { compareSnapshots, emptyDiff } from "./comparison.js";

/**
 * Diff as Plugin Runtime starts it.
 *
 * The selected input group arrives on the start context and is not something
 * the Plugin chooses: the Host validated it against the bindings before
 * activation, so Diff renders the group it was given rather than guessing from
 * whichever port happens to hold a value.
 */
export interface DiffPluginPorts {
  /** Whether a complete comparison is currently bound. */
  hasComparison?(): boolean;
  /** Stable id for the comparison being shown, for the fixed object it opens. */
  comparisonId?(): string | null;
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
        routes: [{ route_id: "diff.state", handle: () => {
          const inputs = context.services?.inputs;
          if (inputs?.selectedGroup() !== "snapshots") return { status: 200, body: { view: emptyDiff("snapshots", "请选择两份文件快照进行对比") } };
          const records = [inputs.read("before"), inputs.read("after")];
          const snapshots = records.filter(record => record?.availability === "available").map(record => ({
            content: record!.payload, source_plugin_id: record!.producer_plugin_id, content_version: record!.version,
          }));
          return { status: 200, body: { view: compareSnapshots(snapshots) } };
        } }],
        commandAvailability: (commandId) => {
          if (commandId !== "diff.open-comparison") {
            return { available: false, reason: `未知命令：${commandId}` };
          }
          return ports.hasComparison?.() === true
            ? { available: true }
            : { available: false, reason: "先选一组完整的对比输入" };
        },
        executeCommand: () => {
          const id = ports.comparisonId?.() ?? null;
          if (id === null) throw new Error("没有可固定的对比");
          return { ref: { view_id: "comparison", object_id: id }, title: "对比" };
        },
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
