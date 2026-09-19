import type {
  PluginAppContribution,
  PluginCommandInput,
  PluginDefinition,
  PluginStartContext,
} from "@molis-ai/molis-work-contracts/platform/plugin";

import { filesManifest } from "./manifest.js";
import { filesUiContribution } from "./ui.js";

/**
 * Files as Plugin Runtime starts it.
 *
 * The Plugin owns the projections; the Host owns the directory grant and the
 * reads. Everything the Host must do arrives through `ports`, so a Files that
 * was given no reader simply reports it cannot open anything, rather than
 * failing at the first click.
 */
export interface FilesPluginPorts {
  /** The file currently in focus, if any, for the `current` command input. */
  currentPath?(): readonly string[] | null;
  /** Whether the Host can list and read under the bound workspace right now. */
  readable?(): boolean;
  /** Called when upstream inputs arrive or go away, so the Host can reload. */
  onWorkspaceChanged?(available: boolean): void | Promise<void>;
  onStop?(context: PluginStartContext): void | Promise<void>;
}

function objectIdFor(input: PluginCommandInput, ports: FilesPluginPorts): string | null {
  if (input.kind === "object") return input.ref.object_id;
  if (input.kind === "current") {
    const path = ports.currentPath?.() ?? null;
    return path === null ? null : path.join("/");
  }
  return null;
}

export function createFilesPlugin(ports: FilesPluginPorts = {}): PluginDefinition {
  return {
    manifest: filesManifest,
    async start(context: PluginStartContext): Promise<PluginAppContribution> {
      for (const permission of filesManifest.permissions) {
        if (permission.required) context.requireGrant(permission.permission);
      }
      return {
        kind: "app",
        views: [filesUiContribution],
        commandAvailability: (commandId) => {
          if (commandId !== "files.open-file") {
            return { available: false, reason: `未知命令：${commandId}` };
          }
          if (ports.readable?.() !== true) {
            return { available: false, reason: "还没有可读的工作目录" };
          }
          return { available: true };
        },
        executeCommand: (_commandId, input) => {
          const objectId = objectIdFor(input, ports);
          if (objectId === null) throw new Error("没有可打开的文件");
          return { ref: { view_id: "tree", object_id: objectId }, title: objectId };
        },
        onUpstreamReady: async () => {
          await ports.onWorkspaceChanged?.(true);
        },
        onUpstreamUnavailable: async () => {
          // The tree is emptied rather than left showing the old workspace: a
          // stale listing invites the user to open a file that is no longer there.
          await ports.onWorkspaceChanged?.(false);
        },
        onEvent: async () => {
          // Coding wrote, or Git moved the working tree. Either way what is on
          // screen may no longer match the disk, so the Host re-reads.
          await ports.onWorkspaceChanged?.(ports.readable?.() === true);
        },
      };
    },
    async stop(context: PluginStartContext): Promise<void> {
      await ports.onStop?.(context);
    },
    async health(): Promise<{ ok: boolean; message: string }> {
      return ports.readable === undefined
        ? { ok: false, message: "宿主没有提供目录读取入口" }
        : { ok: true, message: "就绪" };
    },
  };
}
