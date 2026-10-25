import type { ActionDefinition, ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";

/** A Home plugin declaring one GitHub connection slot (`services.connections`, S-57), with the actions its checks call. */
export function connectionsProbe(name = "connectionsprobe", options: { permissions?: string[]; execution?: "sandbox"; slots?: boolean; binding?: "per_record" } = {}) {
  const id = `io.molis.work.example.${name}`, permissions = ["storage:private", ...(options.permissions ?? ["connections:use"])];
  const contexts: PluginStartContext[] = [];
  const action = (suffix: string, needed: string[], shape: { concurrent?: boolean; query?: boolean } = {}): ActionDefinition<Record<string, never>, unknown> => ({
    capability_id: `${name}.${suffix}`, version: 1, operation: shape.query ? "query" : "command", action: {
      title: suffix, description: "连接服务的探针动作", scope: "home", kind: shape.query ? "query" : "operation", subject_kinds: [],
      audiences: ["user", "agent", "workflow", "mcp", "plugin"],
      permissions: needed.filter(permission => permissions.includes(permission)),
      ...(shape.concurrent === false ? {} : { scheduling: "concurrent" as const }), input_schema: { type: "object", additionalProperties: false },
    },
  });
  const send = action("send", ["connections:use"]), query = action("query", ["connections:use"], { query: true });
  const serial = action("serial", ["connections:use"], { concurrent: false }), plain = action("plain", []);
  const behavior = {
    send: async (context: PluginStartContext, _caller: ActionExecutionContext): Promise<unknown> =>
      context.services!.connections!.request("github", { url: "https://api.github.com/user" }),
  };
  const declared = permissions.includes("connections:use") && options.slots !== false;
  const definition: PluginDefinition = { execution: options.execution, manifest: {
    schema_version: 2, host_api_version: 2, plugin_id: id, version: "1.0.0", name, kind: "app",
    publisher: { publisher_id: "example", signature: `connections-${name}` }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: permissions.map(permission => ({ permission, required: permission === "storage:private", reason: "连接服务测试声明" })),
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [send, query, serial, plain],
    ...(declared ? { connections: { slots: [{ slot_id: "github", service_id: "github", reason: "读取本人的 GitHub 通知", ...(options.binding ? { binding: options.binding } : {}) }] } } : {}),
  }, async start(context) {
    contexts.push(context);
    return { kind: "app", actions: [send, query, serial, plain].map(item => ({ ...item, handle: (caller: ActionExecutionContext) => behavior.send(context, caller) })) };
  } };
  return { id, definition, permissions, contexts, send, query, serial, plain, behavior };
}

export async function grantConnections(host: MolisWorkLocalHost, probe: ReturnType<typeof connectionsProbe>) {
  const platform = await host.homePlugins!.ready(), install = host.homePlugins!.installation(probe.id)!;
  await platform.runtime.stop(install.install_id);
  platform.runtime.grant(install.install_id, probe.permissions);
  await platform.supervisor.restart(probe.id);
  return { platform, install: platform.runtime.get(install.install_id)! };
}
