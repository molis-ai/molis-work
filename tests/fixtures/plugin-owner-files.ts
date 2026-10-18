import assert from "node:assert/strict";
import type { ActionCallContext, ActionDefinition, ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginOwnerFilesClient, PluginOwnerFilesDeclaration, PluginOwnerFilesWriter, PluginStartContext, PluginUpgradeContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { person } from "./home-runtime.js";

/** Business callbacks run only behind the real Runtime action registration and original gateway caller. */
export function ownerFilesProbe(name = "ownerprobe", scope: "home" | "project" = "home", version = "1.0.0") {
  const id = `io.molis.work.example.${name}`, read = `${name}:read`, write = `${name}:write`;
  const permissions = ["storage:private", read, write], contexts: PluginStartContext[] = [], preflight: PluginUpgradeContext[] = [];
  const owner_files: PluginOwnerFilesDeclaration = { store_name: name, entries: [{ name: "catalog.json", kind: "file" }, { name: "documents", kind: "directory" }], read_permission: read, write_permission: write };
  const action = (suffix: string, operation: "query" | "command", required: string[]): ActionDefinition<Record<string, never>, unknown> => ({
    capability_id: `${name}.${suffix}`, version: 1, operation,
    action: { title: suffix, description: "Exercise the owner's files through the real action scope", kind: operation === "query" ? "query" : "operation", scope,
      audiences: ["user"], permissions: required, subject_kinds: [], scheduling: "concurrent", input_schema: { type: "object", additionalProperties: false } },
  });
  const readAction = action("read", "query", [read]), writeAction = action("write", "command", [write]);
  const queryWrite = action("query_write", "query", [write]), undeclared = action("undeclared", "command", [read]);
  const behavior: {
    read(client: PluginOwnerFilesClient, caller: ActionExecutionContext): unknown;
    write(client: PluginOwnerFilesClient, caller: ActionExecutionContext): unknown;
    start(context: PluginStartContext): void;
    stop(context: PluginStartContext): void | Promise<void>;
  } = { read: client => client.list("documents"), write: client => client.write(writer => writer.mkdir("documents")), start: () => {}, stop: () => {} };
  const definition: PluginDefinition = { manifest: { schema_version: 2, host_api_version: 2, plugin_id: id, version, name, kind: "app",
    publisher: { publisher_id: "example", signature: `owner-files-${name}` }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: permissions.map(permission => ({ permission, required: permission === "storage:private", reason: "Own files" })),
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [readAction, writeAction, queryWrite, undeclared],
    upgrade_compatibility: { compatible_from_versions: ["1.0.0"], migratable_from_versions: [] } },
    start(context) {
      contexts.push(context); behavior.start(context);
      const client = () => context.services?.ownerFiles ?? assert.fail("no owner files service");
      return { kind: "app", views: [], actions: [
        { ...readAction, handle: caller => behavior.read(client(), caller) },
        ...[writeAction, queryWrite, undeclared].map(entry => ({ ...entry, handle: (caller: ActionExecutionContext) => behavior.write(client(), caller) })),
      ] };
    }, stop: context => behavior.stop(context), validateUpgrade: ({ context }) => { preflight.push(context); },
  };
  return { id, definition, owner_files, permissions, read, write, contexts, preflight, behavior, readAction, writeAction, queryWrite, undeclared,
    entry: (initialize_owner_files?: (writer: PluginOwnerFilesWriter) => void) => ({ definition, owner_files, ...(initialize_owner_files ? { initialize_owner_files } : {}) }),
    client: (): PluginOwnerFilesClient => contexts.at(-1)?.services?.ownerFiles ?? assert.fail("no owner files service"),
    caller: (projectId: string | null = null): ActionCallContext => person(permissions, projectId) };
}

export async function grantOwnerFiles(host: MolisWorkLocalHost, probe: ReturnType<typeof ownerFilesProbe>) {
  const platform = await host.homePlugins!.ready(), install = host.homePlugins!.installation(probe.id)!;
  await platform.runtime.stop(install.install_id);
  platform.runtime.grant(install.install_id, probe.permissions);
  await platform.supervisor.restart(probe.id);
  return { platform, install: platform.runtime.get(install.install_id) };
}

export function ownerFileActions(host: MolisWorkLocalHost, probe: ReturnType<typeof ownerFilesProbe>) {
  const action = host.homeActionClient();
  return {
    read(run: (client: PluginOwnerFilesClient) => unknown) {
      probe.behavior.read = run;
      return action.invoke(probe.caller(), probe.readAction, {});
    },
    write(run: (writer: PluginOwnerFilesWriter) => unknown) {
      probe.behavior.write = client => client.write(run);
      return action.invoke(probe.caller(), probe.writeAction, {});
    },
  };
}
