import type {
  PluginAppContribution,
  PluginCommandInput,
  PluginDefinition,
  PluginStartContext,
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
  /** Host receipt observer; the returned disposer belongs to this activation. */
  observeOperationSettled?(listener: (event: GitOperationUpdate) => void): () => void;
  /** Whether a workspace is bound and is a repository. */
  ready?(): boolean;
  onStop?(context: PluginStartContext): void | Promise<void>;
}

function objectIdFor(input: PluginCommandInput): string | null {
  return input.kind === "object" ? input.ref.object_id : null;
}

export function createGitPlugin(ports: GitPluginPorts = {}): PluginDefinition {
  const subscriptions = new Map<string, () => void>();
  const key = (context: PluginStartContext) => `${context.install_id}:${context.project_id}`;
  return {
    manifest: gitManifest,
    event_types: gitEventTypes,
    async start(context: PluginStartContext): Promise<PluginAppContribution> {
      let repositoryReady = false;
      for (const permission of gitManifest.permissions) {
        if (permission.required) context.requireGrant(permission.permission);
      }
      let active = true;
      // Git's own pages read the working tree again (PG-061). Only from a delivery or the Host's receipt listener, which
      // `stop` clears before anything else (BL-411).
      const readAgain = () => context.services?.ui.invalidate();
      const unsubscribe = ports.observeOperationSettled?.(event => {
        if (!active) return;
        // Publication checks this activation before Git's pages read again.
        context.services?.events?.publish({ event_type_id: GIT_OPERATION_UPDATED_EVENT, type_version: 1, payload: event });
        // The Host calls this listener, so a refusal must not reach its loop: revoked before `stop` cleared the listener,
        // the activation has no pages left to read again.
        try { readAgain(); } catch { /* Refused once revoked: this activation has no pages left to read again. */ }
      });
      subscriptions.get(key(context))?.();
      subscriptions.set(key(context), () => { active = false; unsubscribe?.(); });
      return {
        kind: "app",
        views: [gitUiContribution],
        routes: gitRoutes(context),
        actions: gitActionHandlers(context, ready => { repositoryReady = ready; }),
        commandAvailability: (commandId) => {
          if (commandId === "git.open-change") {
            return repositoryReady || ports.ready?.() === true
              ? { available: true }
              : { available: false, reason: "还没有可读的 Git 工作区" };
          }
          return { available: false, reason: `未知命令：${commandId}` };
        },
        executeCommand: (_commandId, input) => {
          const objectId = objectIdFor(input);
          if (objectId === null) throw new Error("没有可打开的改动");
          return { ref: { view_id: "changes", object_id: objectId }, title: objectId };
        },
        onUpstreamReady: (_inputs, delivery) => {
          delivery.beforeEffect();
          readAgain();
        },
        onUpstreamUnavailable: () => {
          repositoryReady = false;
          readAgain();
        },
        onEvent: (_event, delivery) => {
          // A Run wrote, or invalidated what it had prepared. Either way the
          // working tree on screen may no longer be the one on disk.
          delivery.beforeEffect();
          readAgain();
        },
      };
    },
    async stop(context: PluginStartContext): Promise<void> {
      subscriptions.get(key(context))?.();
      subscriptions.delete(key(context));
      await ports.onStop?.(context);
    },
    async health(): Promise<{ ok: boolean; message: string }> {
      return { ok: true, message: "插件已启动；仓库状态按当前授权读取" };
    },
  };
}
