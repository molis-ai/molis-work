import { ActionError, resolveActionSubject, type ActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createRiskActionHandlers, type RiskActionPorts } from "./actions.js";
import { riskManifest } from "./manifest.js";
import { riskMethods } from "./methods.js";
import { createRiskPresentationHandlers } from "./presentation.js";
import { createRiskSearchHandlers } from "./search.js";
import { RiskStore } from "./store.js";
import { riskUiContribution } from "./ui.js";

/**
 * Risk as a Plugin Runtime plugin, one instance per project. Its tables are its own in the project's library (`databases.project`);
 * another plugin's object is read through that owner's reader, as the caller (`actions:delegate`), never by its tables.
 */
export function createRiskPlugin(): PluginDefinition {
  return { manifest: riskManifest, methods: riskMethods, async start(context) {
    for (const permission of riskManifest.permissions) if (permission.required) context.requireGrant(permission.permission);
    const projectId = context.project_id, database = context.services?.project_database, directory = context.services?.actions?.directory;
    if (!projectId) throw new ActionError("actions.scope_mismatch", "风险只属于一个项目");
    if (!database || !directory) throw new ActionError("actions.unredeemed", "风险需要项目库与动作目录服务");
    const reader = new RiskStore({ get: (sql, parameters) => database.get(sql, parameters), all: (sql, parameters) => database.all(sql, parameters) }, projectId);
    const subjects: ActionClient = { discover: () => directory.discover(), invoke: (_caller, reference, input) => directory.invoke(reference, input) };
    const read: RiskActionPorts["read"] = run => run(reader);
    const ports: RiskActionPorts = {
      read,
      write: (caller, run) => database.transaction(() => caller.beforeEffect(), tx => run(new RiskStore(tx, projectId), tx)),
      readSubject: async (subject, caller) => (await resolveActionSubject(subjects, caller, subject)).context,
      schedule: (reference, input) => directory.invoke(reference, input),
      now: () => new Date().toISOString(),
    };
    return { kind: "app", views: [riskUiContribution],
      actions: [...createRiskActionHandlers(ports), ...createRiskSearchHandlers(read), ...createRiskPresentationHandlers(read)] };
  } };
}
