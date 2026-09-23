import type {
  PluginAppContribution,
  PluginDefinition,
  PluginStartContext,
} from "@molis-ai/molis-work-contracts/platform/plugin";

import { diffManifest } from "./manifest.js";
import { diffUiContribution } from "./ui.js";
import { compareSnapshots, compareChangeSet, compareRunChangeSet, emptyDiff } from "./comparison.js";
import { DIFF_CHANGESET_TYPE, CODING_CHANGESET_TYPE, parseCodingChangeSet } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";

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
        routes: [{ route_id: "diff.state", handle: request => {
          // An explicitly opened fixed result is independent of the live snapshots group.
          if (request.query.artifact_id !== undefined) {
            const version = Number(request.query.version);
            if (!Number.isSafeInteger(version) || version < 1) return { status: 400, body: { error: "差异版本无效" } };
            try {
              const record = context.services?.artifacts?.read({ artifact_id: request.query.artifact_id, version });
              if (!record || ![DIFF_CHANGESET_TYPE, CODING_CHANGESET_TYPE].includes(record.artifact_type_id) || record.schema_version !== 1 || record.availability !== "available" || record.lifecycle_state !== "active") throw new Error("固定差异不可用");
              if (record.artifact_type_id === CODING_CHANGESET_TYPE) {
                const changeIndex = request.query.change_index === undefined ? 0 : Number(request.query.change_index);
                if (!Number.isSafeInteger(changeIndex) || changeIndex < 0) throw new Error("固定修改序号无效");
                return { status: 200, body: { view: compareRunChangeSet({ content: parseCodingChangeSet(record.payload), source_plugin_id: record.producer_plugin_id, content_version: record.version }, undefined, changeIndex) } };
              }
              return { status: 200, body: { view: compareChangeSet({ content: record.payload, source_plugin_id: record.producer_plugin_id, content_version: record.version }) } };
            } catch { return { status: 400, body: { error: "固定差异不可用，请重新选择原变更" } }; }
          }
          const inputs = context.services?.inputs;
          if (inputs?.selectedGroup() === "change-set") {
            try {
              const record = inputs.read("changeset");
              if (!record || record.availability !== "available") return { status: 200, body: { view: emptyDiff("change-set") } };
              return { status: 200, body: { view: compareRunChangeSet({ content: parseCodingChangeSet(record.payload), source_plugin_id: record.producer_plugin_id, content_version: record.version }) } };
            } catch { return { status: 400, body: { error: "Coding 固定变更当前不可读，请保留原会话后重试" } }; }
          }
          if (inputs?.selectedGroup() === "git-change-set") {
            try {
              const record = inputs.read("git_changeset");
              if (!record || record.availability !== "available" || record.lifecycle_state !== "active") return { status: 200, body: { view: emptyDiff("git-change-set") } };
              return { status: 200, body: { view: compareChangeSet({ content: record.payload, source_plugin_id: record.producer_plugin_id, content_version: record.version }) } };
            } catch { return { status: 400, body: { error: "Git 固定变更当前不可读，请重新选择原变更" } }; }
          }
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
