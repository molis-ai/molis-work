import { syncBindings } from "./sync-binding.js";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createJellyActionHandlers } from "./actions.js";
import { JELLY_WINDOW_ENTRY, jellyDue, writeJellySeriesOverview } from "./overview.js";
import { jellyManifest } from "./manifest.js";
import { JellyStore, type JellyStores } from "./store.js";
import { jellyUiContribution } from "./ui.js";

/** One instance per partition Jelly is enabled in owns that partition's Jelly actions and views. It needs its database and nothing else: no model, no settings. */
export function createJellyPlugin(): PluginDefinition {
  return { manifest: jellyManifest, partitionSync: syncBindings, async start(context) {
    for (const permission of jellyManifest.permissions) if (permission.required) context.requireGrant(permission.permission);
    const database = context.services?.database;
    if (!database) throw new ActionError("actions.unredeemed", "宿主未提供 Jelly 库");
    const readOnly = () => { throw new ActionError("actions.execution_failed", "Jelly 的读取不写入"); };
    const due = context.services?.due;
    const armWindow = () => {
      if (!due) return;
      const today = new Date().toISOString().slice(0, 10);
      if (!database.get("SELECT 1 AS active FROM jelly_series WHERE until IS NULL OR until >= ? LIMIT 1", [today])) {
        due.cancel(JELLY_WINDOW_ENTRY);
        return;
      }
      const next = new Date(); next.setUTCDate(next.getUTCDate() + 1); next.setUTCHours(0, 0, 0, 0);
      due.register({ entry_key: JELLY_WINDOW_ENTRY, due_at: next.toISOString() });
    };
    const roll = async (check: () => void) => {
      await database.transaction(async () => check(), tx => {
        for (const series of new JellyStore(tx).series()) writeJellySeriesOverview(tx, series);
      });
      armWindow();
    };
    if (database.get("SELECT 1 AS active FROM jelly_series LIMIT 1")) await roll(() => context.requireGrant("storage:private"));
    const stores: JellyStores = {
      read: run => run(new JellyStore({ get: (sql, parameters) => database.get(sql, parameters), all: (sql, parameters) => database.all(sql, parameters), run: readOnly, savepoint: readOnly })),
      write: async (caller, run) => {
        const result = await database.transaction(() => caller.beforeEffect(), transaction => run(new JellyStore(transaction)));
        armWindow();
        return result;
      },
    };
    return { kind: "app", sync: syncBindings(context), views: [jellyUiContribution], actions: createJellyActionHandlers(stores),
      onDue: async (entry, delivery) => {
        if (entry.source === "plugin" && entry.entry_key === JELLY_WINDOW_ENTRY) { await roll(delivery.beforeEffect); return {}; }
        return jellyDue({ get: database.get.bind(database), run: readOnly }, entry.entry_key, entry.due_at);
      } };
  } };
}
