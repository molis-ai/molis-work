import { syncBindings } from "./sync-binding.js";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createJellyActionHandlers } from "./actions.js";
import { jellyManifest } from "./manifest.js";
import { JellyStore, type JellyStores } from "./store.js";
import { jellyUiContribution } from "./ui.js";

/** One Home Runtime instance owns every Jelly action and view. It needs its database and nothing else: no model, no settings. */
export function createJellyPlugin(): PluginDefinition {
  return { manifest: jellyManifest, async start(context) {
    for (const permission of jellyManifest.permissions) if (permission.required) context.requireGrant(permission.permission);
    const database = context.services?.database;
    if (!database) throw new ActionError("actions.unredeemed", "宿主未提供 Jelly 库");
    const readOnly = () => { throw new ActionError("actions.execution_failed", "Jelly 的读取不写入"); };
    const stores: JellyStores = {
      read: run => run(new JellyStore({ get: (sql, parameters) => database.get(sql, parameters), all: (sql, parameters) => database.all(sql, parameters), run: readOnly, savepoint: readOnly })),
      write: (caller, run) => database.transaction(() => caller.beforeEffect(), transaction => run(new JellyStore(transaction))),
    };
    return { kind: "app", sync: syncBindings(context), views: [jellyUiContribution], actions: createJellyActionHandlers(stores) };
  } };
}
