import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDatabase, PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createBriefHandlers, type BriefPorts } from "./briefs.js";
import { workBriefErrors } from "./error.js";
import { createFixHandlers } from "./fix.js";
import { workBriefManifest } from "./manifest.js";
import { createNextHandlers } from "./next.js";
import { createPresentationHandlers } from "./presentation.js";
import { BriefStore } from "./store.js";
import { workBriefUiContribution } from "./ui.js";

/** The two halves read and write the one library the same way; only the scope of the store differs. */
export function briefStores(database: PluginDatabase, projectId: string | null): Pick<BriefPorts, "read" | "write"> {
  return {
    read: run => run(new BriefStore({ get: (sql, parameters) => database.get(sql, parameters), all: (sql, parameters) => database.all(sql, parameters) }, projectId)),
    write: (caller, run) => database.transaction(() => caller.beforeEffect(), transaction => run(new BriefStore(transaction, projectId))),
  };
}
export const newBriefId = (prefix: string) => `${prefix}-${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;

/**
 * Work Brief's project half, one instance per project: the project's briefs and the page. Its rows are in the plugin's one Home
 * library (`databases.home`, shared with the Home half); everything of another plugin is read through the action directory as the
 * caller (`actions:delegate`). Without a Home there is no library: the half still starts and its actions answer `work_brief.unavailable`.
 */
export function createWorkBriefPlugin(): PluginDefinition {
  return { manifest: workBriefManifest, async start(context) {
    for (const permission of workBriefManifest.permissions) if (permission.required) context.requireGrant(permission.permission);
    const projectId = context.project_id, database = context.services?.database, directory = context.services?.actions?.directory;
    if (!projectId) throw new ActionError("actions.scope_mismatch", "项目简报只属于一个项目");
    const missing = (): never => { throw workBriefErrors.unavailable("这里没有个人 Home，简报暂时不可用"); };
    const stores: Pick<BriefPorts, "read" | "write"> = database ? briefStores(database, projectId) : { read: missing, write: missing };
    const ports: BriefPorts = { ...stores, now: () => new Date().toISOString(), newId: newBriefId,
      directory: () => directory ?? missing() };
    return { kind: "app", views: [workBriefUiContribution], actions: [...createBriefHandlers(ports), ...createNextHandlers(ports), ...createPresentationHandlers(ports.read),
      ...(database ? createFixHandlers(ports, database, context.services?.artifacts, workBriefManifest.publisher.signature) : [])] };
  } };
}
