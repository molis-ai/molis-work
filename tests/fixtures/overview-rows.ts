import { mainOverviewLibrary, openPluginProjectLibrary, pluginOverviewFor, runningPartitionPlatformServices, type LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import type { PluginInstanceRecord, PluginManifest, PluginOverviewRows } from "@molis-ai/molis-work-contracts/platform/plugin";
import { installIdentity } from "@molis-ai/molis-work-plugin-runtime";

/**
 * Writes a main-database plugin's overview rows (V17) as its running instance does, through the platform's own `services.overview`: in
 * one transaction of the plugin's library client, stamped with the plugin's installation in that partition, and the Home's overview read
 * again afterwards. For a test that seeds a plugin's own table directly and needs the row its write would have kept with it.
 */
export async function writeMainOverviewRows(home: string, store: Pick<LocalProjectDatabase, "db" | "path">, projectId: string, manifest: PluginManifest,
  write: (rows: PluginOverviewRows) => void): Promise<void> {
  const library = openPluginProjectLibrary({ db: store.db, path: store.path }, manifest, () => {}, { install_id: "overview-test-seed", installation_generation: "1" }).client;
  const installId = installIdentity(manifest);
  const record = { install_id: installId, plugin_id: manifest.plugin_id, state: "running" } as PluginInstanceRecord;
  const context = { install_id: installId };
  const client = pluginOverviewFor(manifest, context, library, store.db, () => {}, () => record,
    id => runningPartitionPlatformServices(home)?.partitionChanged(projectId, id, [mainOverviewLibrary(home, projectId, id, manifest)]));
  if (!client) throw new Error(`${manifest.plugin_id} 没有声明主库总览`);
  await library.transaction(async () => {}, tx => client.join(tx, write));
}
