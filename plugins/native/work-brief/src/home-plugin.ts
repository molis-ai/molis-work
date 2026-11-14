import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { workBriefErrors } from "./error.js";
import { workBriefManifest } from "./manifest.js";
import { createPersonalHandlers } from "./personal.js";
import { briefStores, newBriefId } from "./plugin.js";

/**
 * Work Brief's Home half: the personal brief. It opens the same library as the project halves with no project scope, and reaches a
 * project's rows only for the projects the Host lists on the person's own call (`project_reach`).
 */
export function createHomeWorkBriefPlugin(): PluginDefinition {
  return { manifest: workBriefManifest, async start(context) {
    for (const permission of workBriefManifest.permissions) if (permission.required) context.requireGrant(permission.permission);
    const database = context.services?.database, directory = context.services?.actions?.directory;
    if (!database) throw new ActionError("actions.unredeemed", "宿主未提供简报库");
    return { kind: "app", views: [], actions: createPersonalHandlers({ ...briefStores(database, null), now: () => new Date().toISOString(), newId: newBriefId,
      directory: () => directory ?? (() => { throw workBriefErrors.unavailable("这里读不到个人范围的来源"); })() }) };
  } };
}
