import type { ActionDefinition, ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginStartContext, PluginUpgradeContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";

export function materialsProbe(name = "materialsprobe", options: { permissions?: string[]; readPermissions?: string[]; version?: string; execution?: "sandbox" } = {}) {
  const id = `io.molis.work.example.${name}`, permissions = ["storage:private", ...(options.permissions ?? ["materials:read", "materials:fetch"])];
  const contexts: PluginStartContext[] = [], preflight: PluginUpgradeContext[] = [];
  const action = (suffix: string, needed: string[], concurrent = true): ActionDefinition<Record<string, never>, unknown> => ({
    capability_id: `${name}.${suffix}`, version: 1, operation: "command", action: {
      title: suffix, description: "材料服务的真实探针动作", scope: "home", kind: "operation", subject_kinds: [],
      audiences: ["user", "agent", "workflow", "mcp", "plugin"],
      permissions: needed.filter(permission => permissions.includes(permission)),
      ...(concurrent ? { scheduling: "concurrent" as const } : {}), input_schema: { type: "object", additionalProperties: false },
    },
  });
  const read = action("read", options.readPermissions ?? ["materials:read"]), source = action("source", ["materials:fetch"]), serial = action("serial", ["materials:read"], false), plain = action("plain", []);
  const behavior = {
    read: async (context: PluginStartContext, _caller: ActionExecutionContext): Promise<unknown> => context.services!.materials!.extract!({ file_name: "note.txt", bytes: Buffer.from("材料原文") }),
    source: async (context: PluginStartContext, _caller: ActionExecutionContext): Promise<unknown> => context.services!.materials!.readSource!("http://127.0.0.1/"),
  };
  const definition: PluginDefinition = { execution: options.execution, manifest: {
    schema_version: 2, host_api_version: 2, plugin_id: id, version: options.version ?? "1.0.0", name, kind: "app",
    publisher: { publisher_id: "example", signature: `materials-${name}` }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: permissions.map(permission => ({ permission, required: permission === "storage:private", reason: "材料服务测试声明" })),
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [read, source, serial, plain],
    upgrade_compatibility: { compatible_from_versions: ["1.0.0"], migratable_from_versions: [] },
  }, async start(context) {
    contexts.push(context);
    return { kind: "app", actions: [read, source, serial, plain].map(item => ({ ...item,
      handle: (caller: ActionExecutionContext) => (item === source ? behavior.source : behavior.read)(context, caller),
    })) };
  }, async validateUpgrade({ context }) { preflight.push(context); } };
  return { id, definition, permissions, contexts, preflight, read, source, serial, plain, behavior };
}

export async function grantMaterials(host: MolisWorkLocalHost, probe: ReturnType<typeof materialsProbe>) {
  const platform = await host.homePlugins!.ready(), install = host.homePlugins!.installation(probe.id)!;
  await platform.runtime.stop(install.install_id);
  platform.runtime.grant(install.install_id, probe.permissions);
  await platform.supervisor.restart(probe.id);
  return { platform, install: platform.runtime.get(install.install_id) };
}
