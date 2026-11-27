import { mainOverviewLibrary, openPluginProjectLibrary, pluginOverviewFor, runningPartitionPlatformServices, type LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import type { PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import { CodingSessionStore, codingManifest } from "@molis-ai/molis-work-plugin-coding";
import { installIdentity } from "@molis-ai/molis-work-plugin-runtime";

/** The `beforeEffect` of a caller that is always current: the seed a test writes is not an action's. */
export const noEffect = async (): Promise<void> => {};

/**
 * Coding's session store over a project's library, through the Host's own `services.project_database` client
 * (`openPluginProjectLibrary`, the one the Plugin Runtime lends a plugin): the tables are the ones the library made for Coding
 * when it opened, and every statement is checked against the platform's record of them. This is how a test seeds or reads what a
 * running Coding keeps; Coding itself is given its own client when it starts.
 *
 * With `overview` (the Home and the project), the store also writes its sessions' overview rows as a running Coding does (V17), stamped
 * with Coding's own installation in that project, and the Home's overview reads them again after each write.
 *
 * The client reads through a second, read-only connection of the same file and writes through `store.db`; it needs no closing
 * beyond the library's own.
 */
export function codingSessions(store: Pick<LocalProjectDatabase, "db" | "path">, overview?: { readonly home: string; readonly project_id: string }): CodingSessionStore {
  const library = openPluginProjectLibrary({ db: store.db, path: store.path }, codingManifest, () => {}, { install_id: "coding-test-seed", installation_generation: "1" }).client;
  if (!overview) return new CodingSessionStore(library);
  const installId = installIdentity(codingManifest);
  const record = { install_id: installId, plugin_id: codingManifest.plugin_id, state: "running" } as PluginInstanceRecord;
  const context = { install_id: installId };
  const client = pluginOverviewFor(codingManifest, context, library, store.db, () => {}, () => record,
    id => runningPartitionPlatformServices(overview.home)?.partitionChanged(overview.project_id, id, [mainOverviewLibrary(overview.home, overview.project_id, id, codingManifest)]));
  return new CodingSessionStore(library, client);
}
