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
 * reads. Which folder Files browses is the project-settings action its
 * Manifest consumes, asked on every read, so the factory takes nothing from
 * the Host (BL-616): with no usable folder, each read says so instead.
 */
export function createFilesPlugin(): PluginDefinition {
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
    async health(): Promise<{ ok: boolean; message: string }> {
      return { ok: true, message: "插件已启动；浏览目录按项目设置读取" };
    },
  };
}
