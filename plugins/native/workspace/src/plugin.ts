import type {
  PluginAppContribution,
  PluginDefinition,
  PluginStartContext,
} from "@molis-ai/molis-work-contracts/platform/plugin";

import { workspaceEventTypes } from "./events.js";
import { workspaceManifest } from "./manifest.js";
import { workspaceUiContribution } from "./ui.js";
import { workspaceRoutes } from "./routes.js";

export interface WorkspacePluginPorts {
  /**
   * Whether the Host can resolve the current project's directory right now.
   *
   * Left out, the reveal command reports unavailable rather than opening a
   * panel for a directory nobody has checked.
   */
  currentWorkspaceId?(): string | null;
  onStop?(context: PluginStartContext): void | Promise<void>;
}

export function createWorkspacePlugin(ports: WorkspacePluginPorts = {}): PluginDefinition {
  return {
    manifest: workspaceManifest,
    event_types: workspaceEventTypes,
    async start(context: PluginStartContext): Promise<PluginAppContribution> {
      for (const permission of workspaceManifest.permissions) {
        if (permission.required) context.requireGrant(permission.permission);
      }
      return {
        kind: "app",
        views: [workspaceUiContribution],
        routes: workspaceRoutes(context),
        commandAvailability: (commandId) => {
          if (commandId !== "workspace.reveal") {
            return { available: false, reason: `未知命令：${commandId}` };
          }
          return ports.currentWorkspaceId?.() === undefined || ports.currentWorkspaceId?.() === null
            ? { available: false, reason: "这个项目还没有绑定工作目录" }
            : { available: true };
        },
        executeCommand: (_commandId, _input) => ({
          ref: { view_id: "source", object_id: ports.currentWorkspaceId?.() ?? "workspace" },
          title: "工作目录",
        }),
      };
    },
    async stop(context: PluginStartContext): Promise<void> {
      await ports.onStop?.(context);
    },
    async health(): Promise<{ ok: boolean; message: string }> {
      return ports.currentWorkspaceId === undefined
        ? { ok: false, message: "宿主没有提供工作目录入口" }
        : { ok: true, message: "就绪" };
    },
  };
}
