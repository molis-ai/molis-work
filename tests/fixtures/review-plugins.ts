import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { PluginManifest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { LocalProjectDatabase, PluginHostExecutor, type MolisWorkLocalHost, hostDependencyCheck } from "@molis-ai/molis-work-app-local-host";

/*
 * A Host operation a person reviews is asked for by a plugin through its SDK, with the caller the Host issued its session, and
 * the Host checks `review:<kind>` against that installation (PG-009, S-50). A test asks the way a plugin does: it starts a plugin
 * here and calls through the plugin's own services. Nothing here makes a caller: only the Host issues one.
 */

/** Plugins calling `host`'s actions in `reference`, started the way the Host starts them; their store is `databasePath`. */
export function reviewPlugins(host: MolisWorkLocalHost, reference: LocalHostProjectReference, databasePath: string) {
  const store = new LocalProjectDatabase(databasePath);
  const runtime = new PluginRuntime(undefined, new PluginHostExecutor({ actions: { registry: host.actionRegistry(reference),
    client: { ...host.actionClient(reference), ...host.syncActionClient(reference) }, project_id: reference.project_id },
    project_id: reference.project_id, actor_id: LOCAL_PERSON_ACTOR_ID, ui: new UiHost(), dependencyCheck: hostDependencyCheck(host.client(reference)),
    artifacts: new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
    processItems: new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
    privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }) }));
  const started = new Map<string, PluginStartContext>(), installs: string[] = [];
  return {
    runtime,
    /** Installs and starts `plugin_id`, declaring `permissions`, consuming `consumes` and granted `grants`; returns its installation. */
    async start(plugin_id: string, permissions: PluginManifest["permissions"], grants: readonly string[], consumes: readonly string[]): Promise<string> {
      const name = plugin_id.split(".").at(-1)!;
      const { install } = runtime.install({ deployment: "local", grants: [...grants], definition: {
        manifest: { schema_version: 2, host_api_version: 2, plugin_id, version: "1.0.0", name, kind: "app",
          publisher: { publisher_id: "example", signature: `example-${name}` }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
          permissions, capabilities: { provides: [], consumes: [...consumes] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] } },
        async start(context) { started.set(plugin_id, context); return { kind: "app" }; } } });
      installs.push(install.install_id);
      await runtime.start(install.install_id);
      return install.install_id;
    },
    /** The Host's actions as `plugin_id`'s current session calls them: through its SDK, with the caller the Host issued it. */
    actions(plugin_id: string) {
      return started.get(plugin_id)!.services!.actions!;
    },
    async close() {
      for (const install of installs) await runtime.stop(install).catch(() => {});
      store.close();
    },
  };
}
