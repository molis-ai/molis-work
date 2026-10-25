import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { goalsManifest } from "./manifest.js";
import { PersonalPlanningMethods, resolvePlanningMethodPacks } from "./module/index.js";
import { createPersonalPlanningActionHandlers } from "./personal-planning-actions.js";
import { PluginSqlite } from "./plugin-sqlite.js";

/**
 * Goals' Home half (PG-094 S13): the planning methods the person keeps across projects, in the library its Manifest declares in the
 * Home (`databases.home`). Each project's half is the other instance of the same plugin (`createGoalsPlugin`); it reads these through
 * `goals.planning.personal.list`, as whoever is calling. The half answers only its own two actions: a project's actions are the
 * project half's, and each half is checked against the Manifest for its own share only.
 */
export function createHomeGoalsPlugin(): PluginDefinition {
  return { manifest: goalsManifest, async start(context) {
    for (const permission of goalsManifest.permissions) if (permission.required) context.requireGrant(permission.permission);
    const database = context.services?.database;
    if (!database) throw new ActionError("actions.unredeemed", "宿主未提供 Goals 的个人库");
    const sqlite = new PluginSqlite();
    const methods = new PersonalPlanningMethods(sqlite);
    return { kind: "app", actions: createPersonalPlanningActionHandlers({
      list: () => resolvePlanningMethodPacks(sqlite.read(database, () => methods.list())),
      saveAvailability: () => ({ available: true }),
      save: (caller, method) => database.transaction(() => caller.beforeEffect(), transaction => sqlite.write(transaction, () => methods.save(method, new Date().toISOString()))),
    }) };
  } };
}
