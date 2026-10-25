import type {
  PluginAppContribution,
  PluginDefinition,
  PluginStartContext,
} from "@molis-ai/molis-work-contracts/platform/plugin";

import { filesManifest } from "./manifest.js";
import { filesUiContribution } from "./ui.js";
import { filesActionHandlers, filesBrowsing } from "./actions.js";
import { filesRoutes } from "./routes.js";

/**
 * Files as Plugin Runtime starts it.
 *
 * The Plugin owns the projections; the Host owns the directory grant and the
 * reads. Everything the Host must do arrives through `ports`, so a Files that
 * was given no reader simply reports it cannot open anything, rather than
 * failing at the first click.
 */
export interface FilesPluginPorts {
  /** Whether the Host can list and read under the bound workspace right now. */
  readable?(): boolean;
  onStop?(context: PluginStartContext): void | Promise<void>;
}

export function createFilesPlugin(ports: FilesPluginPorts = {}): PluginDefinition {
  return {
    manifest: filesManifest,
    async start(context: PluginStartContext): Promise<PluginAppContribution> {
      for (const permission of filesManifest.permissions) {
        if (permission.required) context.requireGrant(permission.permission);
      }
      const folder = filesBrowsing(context);
      return {
        kind: "app",
        views: [filesUiContribution],
        routes: filesRoutes(context),
        actions: filesActionHandlers(context, folder),
        onEvent: async (_event, delivery) => {
          // Coding wrote, Git moved the working tree, or the Host ran a
          // person-approved operation or an Agent's approved write in the
          // workspace (`host.workspace.changed@1`, BL-379, BL-366). Either way
          // what is on screen may no longer match the disk, so Files' own pages
          // read again (PG-061), and it looks again at which folder it browses:
          // a switch withdraws the old folder's snapshots. Only from a delivery:
          // Files keeps no timer or watcher that could call it once this
          // activation has stopped (BL-411).
          delivery.beforeEffect();
          await folder.confirm(async () => delivery.beforeEffect());
          delivery.beforeEffect();
          context.services?.ui.invalidate();
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
