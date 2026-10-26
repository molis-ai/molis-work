import {
  HOST_REVIEW_SETTLED_EVENT,
  type HostReviewSettledPayload,
  type PluginAppContribution,
  type PluginDefinition,
  type PluginStartContext,
} from "@molis-ai/molis-work-contracts/platform/plugin";

import { GIT_OPERATION_UPDATED_EVENT, type GitOperationUpdate, gitEventTypes } from "./events.js";
import { gitManifest } from "./manifest.js";
import { gitUiContribution } from "./ui.js";
import { gitActionHandlers } from "./actions.js";
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
  onStop?(context: PluginStartContext): void | Promise<void>;
}

export function createGitPlugin(ports: GitPluginPorts = {}): PluginDefinition {
  return {
    manifest: gitManifest,
    event_types: gitEventTypes,
    async start(context: PluginStartContext): Promise<PluginAppContribution> {
      for (const permission of gitManifest.permissions) {
        if (permission.required) context.requireGrant(permission.permission);
      }
      // Git's own pages read the working tree again (PG-061). Only from a delivery: Git keeps no timer or listener that could
      // call it once this activation has stopped (BL-411).
      const readAgain = () => context.services?.ui.invalidate();
      return {
        kind: "app",
        views: [gitUiContribution],
        routes: gitRoutes(context),
        actions: gitActionHandlers(context),
        onUpstreamReady: (_inputs, delivery) => {
          delivery.beforeEffect();
          readAgain();
        },
        onUpstreamUnavailable: () => {
          readAgain();
        },
        onEvent: (event, delivery) => {
          // A Run wrote, or invalidated what it had prepared; a person-approved operation ran in the workspace, whoever asked
          // (`host.workspace.changed@1`, BL-379); or one Git asked for has run (`host.review.settled@1`, sent only to this
          // installation, S-54). Either way the working tree on screen may no longer be the one on disk.
          delivery.beforeEffect();
          if (event.event_type_id === HOST_REVIEW_SETTLED_EVENT) {
            const { workspace_id, operation_id, outcome } = event.payload as HostReviewSettledPayload;
            // Files reads again on Git's own event, as before; publication checks this activation first.
            const update: GitOperationUpdate = { workspace_id, operation_id, outcome };
            context.services?.events?.publish({ event_type_id: GIT_OPERATION_UPDATED_EVENT, type_version: 1, payload: update });
          }
          readAgain();
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
