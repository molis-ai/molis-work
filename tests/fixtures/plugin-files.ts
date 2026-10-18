import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import type { ActionCallContext, ActionDefinition, ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginFilesClient, PluginFilesDeclaration, PluginStartContext, PluginUpgradeContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { homeStoreRegistry } from "@molis-ai/molis-work-storage";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { createPluginPlatform, DEMO_PROJECT_ID, homeStores, LocalProjectDatabase, seedDemoBoard, type MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { pluginActions } from "./plugin-actions.js";
import { person } from "./home-runtime.js";

export function filesProbe(name = "fileprobe", scope: "home" | "project" = "home", version = "1.0.0") {
  const id = `io.molis.work.example.${name}`, read = `${name}:read`, write = `${name}:write`;
  const permissions = ["storage:private", read, write], contexts: PluginStartContext[] = [], preflight: PluginUpgradeContext[] = [];
  const files: PluginFilesDeclaration = { store_name: name, directory: "assets", max_file_bytes: 64, read_permission: read, write_permission: write };
  const action = (suffix: string, operation: "query" | "command"): ActionDefinition<{ name: string; text?: string }, unknown> => ({
    capability_id: `${name}.${suffix}`, version: 1, operation,
    action: { title: suffix, description: "Read or write the probe's own files", kind: operation === "query" ? "query" : "operation", scope,
      audiences: ["user"], permissions: [operation === "query" ? read : write], subject_kinds: [], scheduling: "concurrent",
      input_schema: { type: "object", additionalProperties: false, required: ["name"], properties: { name: { type: "string" }, text: { type: "string" } } } },
  });
  const readAction = action("read", "query"), create = action("create", "command"), remove = action("remove", "command");
  const behavior = { beforeWrite: async (caller: ActionExecutionContext) => caller.beforeEffect(), stop: async (_context: PluginStartContext) => {} };
  const definition: PluginDefinition = { manifest: { schema_version: 2, host_api_version: 2, plugin_id: id, version, name, kind: "app",
    publisher: { publisher_id: "example", signature: `files-${name}` }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: permissions.map(permission => ({ permission, required: permission !== write, reason: "Own files" })),
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [readAction, create, remove],
    upgrade_compatibility: { compatible_from_versions: ["1.0.0"], migratable_from_versions: [] } },
    start(context) {
      contexts.push(context);
      const client = () => context.services?.files ?? assert.fail("no files service");
      return { kind: "app", views: [], actions: [
        { ...readAction, handle: (_caller, input) => { const bytes = client().read((input as { name: string }).name); return bytes === null ? null : Buffer.from(bytes).toString("utf8"); } },
        { ...create, handle: async (caller, input) => { const value = input as { name: string; text?: string };
          await client().create({ ...caller, beforeEffect: () => behavior.beforeWrite(caller) }, value.name, Buffer.from(value.text ?? "")); return true; } },
        { ...remove, handle: async (caller, input) => { await client().remove({ ...caller, beforeEffect: () => behavior.beforeWrite(caller) }, (input as { name: string }).name); return true; } },
      ] };
    },
    stop: context => behavior.stop(context), validateUpgrade: ({ context }) => { preflight.push(context); },
  };
  return { id, definition, files, permissions, read, write, contexts, preflight, behavior, readAction, create, remove,
    client: (): PluginFilesClient => contexts.at(-1)?.services?.files ?? assert.fail("no files service"),
    caller: (projectId: string | null = null): ActionCallContext => person(permissions, projectId) };
}

export async function grantFiles(host: MolisWorkLocalHost, probe: ReturnType<typeof filesProbe>) {
  const platform = await host.homePlugins!.ready(), install = host.homePlugins!.installation(probe.id)!;
  await platform.runtime.stop(install.install_id);
  platform.runtime.grant(install.install_id, probe.permissions);
  await platform.supervisor.restart(probe.id);
  return { platform, install };
}

/** The actual project platform, with an explicit Home owner registry; no Host fixture registration shortcut. */
export function filesProject(home: string, probe: ReturnType<typeof filesProbe>, options: { withoutHome?: boolean; owner?: string; unregistered?: boolean } = {}) {
  const file = join(mkdtempSync(join(home, "project-")), "project.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file), actions = pluginActions(store, DEMO_PROJECT_ID);
  const stores = homeStoreRegistry([...homeStores().stores, ...(options.unregistered ? [] : [{ path: probe.files.store_name, owner: options.owner ?? probe.id }])]);
  const platform = createPluginPlatform({ actions, project_id: DEMO_PROJECT_ID, actor_id: "tester", db: store.db, journal: store,
    artifacts: new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
    processItems: new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) }),
    ui: new UiHost(), privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }),
    home: options.withoutHome ? null : { directory: home, completeText: () => null, stores } });
  return { platform, store, client: actions.client, projectId: DEMO_PROJECT_ID,
    async close() {
      try { await platform.closeCoordination(); for (const instance of platform.runtime.list()) if (instance.state === "running") await platform.runtime.stop(instance.install_id); }
      finally { store.close(); }
    } };
}
