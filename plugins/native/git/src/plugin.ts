import type {
  PluginAppContribution,
  PluginCommandInput,
  PluginDefinition,
  PluginStartContext,
} from "@molis-ai/molis-work-contracts/platform/plugin";

import { gitEventTypes } from "./events.js";
import { gitManifest } from "./manifest.js";
import { gitUiContribution } from "./ui.js";
import { gitRoutes } from "./routes.js";

/**
 * Git as Plugin Runtime starts it.
 *
 * The Plugin never runs `git`. It parses what the Host ran, decides what the
 * surface says, and asks the Host to perform operations — which the Host does
 * under its own approval. That is what keeps a surface that merely *shows* a
 * change set from being a place where work can be committed.
 */
export interface GitPluginPorts {
  /** Whether a workspace is bound and is a repository. */
  ready?(): boolean;
  /** Whether a Run's change set is currently offerable. */
  acceptable?(): boolean;
  /** The change currently selected, for the `current` command input. */
  selectedPath?(): readonly string[] | null;
  /** The Host re-reads status; the Plugin only says when it should. */
  onWorkingTreeChanged?(reason: "upstream" | "event" | "unavailable"): void | Promise<void>;
  onStop?(context: PluginStartContext): void | Promise<void>;
}

function objectIdFor(input: PluginCommandInput, ports: GitPluginPorts): string | null {
  if (input.kind === "object") return input.ref.object_id;
  if (input.kind === "agent-session") return input.session_id;
  if (input.kind === "artifacts") return input.references[0]?.artifact_id ?? null;
  const path = ports.selectedPath?.() ?? null;
  return path === null ? null : path.join("/");
}

export function createGitPlugin(ports: GitPluginPorts = {}): PluginDefinition {
  return {
    manifest: gitManifest,
    event_types: gitEventTypes,
    async start(context: PluginStartContext): Promise<PluginAppContribution> {
      let repositoryReady = false;
      for (const permission of gitManifest.permissions) {
        if (permission.required) context.requireGrant(permission.permission);
      }
      return {
        kind: "app",
        views: [gitUiContribution],
        routes: gitRoutes(context, ready => { repositoryReady = ready; }),
        commandAvailability: (commandId) => {
          if (commandId === "git.open-change") {
            return repositoryReady || ports.ready?.() === true
              ? { available: true }
              : { available: false, reason: "还没有可读的 Git 工作区" };
          }
          if (commandId === "git.accept-run-changes") {
            return ports.acceptable?.() === true
              ? { available: true }
              : { available: false, reason: "现在没有可以接受的变更" };
          }
          return { available: false, reason: `未知命令：${commandId}` };
        },
        executeCommand: (commandId, input) => {
          const objectId = objectIdFor(input, ports);
          if (objectId === null) throw new Error("没有可打开的改动");
          return {
            ref: { view_id: "changes", object_id: objectId },
            title: commandId === "git.accept-run-changes" ? "接受变更" : objectId,
          };
        },
        onUpstreamReady: async () => {
          await ports.onWorkingTreeChanged?.("upstream");
        },
        onUpstreamUnavailable: async () => {
          repositoryReady = false;
          await ports.onWorkingTreeChanged?.("unavailable");
        },
        onEvent: async () => {
          // A Run wrote, or invalidated what it had prepared. Either way the
          // working tree on screen may no longer be the one on disk.
          await ports.onWorkingTreeChanged?.("event");
        },
      };
    },
    async stop(context: PluginStartContext): Promise<void> {
      await ports.onStop?.(context);
    },
    async health(): Promise<{ ok: boolean; message: string }> {
      return { ok: true, message: "插件已启动；仓库状态按当前授权读取" };
    },
  };
}
