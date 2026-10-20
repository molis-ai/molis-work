import type { ActionDefinition, ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginRouteRequest, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { actionErrorResponse, bindPluginActionRoute } from "@molis-ai/molis-work-plugin-sdk";
import type { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";

interface Input { url?: string; key?: string; max?: number }

/**
 * A Home plugin that uses the three material services beyond `materials:read` and `materials:fetch`: `materials:fetch_local` (read a
 * page on this machine), `materials:original` (keep and re-read the file the person gave the Host's entry in an import). Every action
 * declares only the permission its service needs, in a concurrent action, as the Runtime requires. Its routes are the real HTTP entry
 * an import goes through; `forge` is a plugin that tries to put a file on the call itself. `required` makes every permission one the
 * installation needs, so a project-level fixture starts with them granted.
 */
export function localOriginalProbe(name = "localoriginal", options: { permissions?: string[]; version?: string; required?: boolean } = {}) {
  const id = `io.molis.work.example.${name}`, permissions = ["storage:private", ...(options.permissions ?? ["materials:fetch", "materials:fetch_local", "materials:original"])];
  const contexts: PluginStartContext[] = [];
  const action = (suffix: string, needed: string[]): ActionDefinition<Input, unknown> => ({
    capability_id: `${name}.${suffix}`, version: 1, operation: "command", action: {
      title: suffix, description: "本机页面与原始文件的真实探针动作", scope: "home", kind: "operation", subject_kinds: [],
      audiences: ["user", "agent", "workflow", "mcp", "plugin"], permissions: needed.filter(permission => permissions.includes(permission)),
      scheduling: "concurrent" as const,
      input_schema: { type: "object", additionalProperties: false, properties: { url: { type: "string" }, key: { type: "string" }, max: { type: "integer" } } },
    },
  });
  const local = action("local", ["materials:fetch_local"]), source = action("source", ["materials:fetch"]), claim = action("claim", ["materials:original"]),
    original = action("original", ["materials:original"]), release = action("release", ["materials:original"]), actions = [local, source, claim, original, release];
  const materials = (context: PluginStartContext) => context.services!.materials!;
  const behavior: Record<string, (context: PluginStartContext, input: Input, caller: ActionExecutionContext) => Promise<unknown>> = {
    [local.capability_id]: (context, input) => materials(context).readLocalPage!(input.url!),
    [source.capability_id]: (context, input) => materials(context).readSource!(input.url!),
    [claim.capability_id]: async (context, input) => { await materials(context).claimOriginal!(input.key!); return { claimed: input.key }; },
    [original.capability_id]: async (context, input) => {
      const { bytes } = await materials(context).readOriginal!(input.key!, input.max === undefined ? {} : { maxBytes: input.max });
      return { text: Buffer.from(bytes).toString("utf8"), length: bytes.length };
    },
    [release.capability_id]: async (context, input) => { await materials(context).releaseOriginal!(input.key!); return { released: input.key }; },
  };
  const route = (route_id: string, method: "GET" | "POST") => ({ route_id, method, path: `/${route_id}`, permission: "storage:private" });
  const definition: PluginDefinition = { manifest: {
    schema_version: 2, host_api_version: 2, plugin_id: id, version: options.version ?? "1.0.0", name, kind: "app",
    publisher: { publisher_id: "example", signature: `local-original-${name}` }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: permissions.map(permission => ({ permission, required: options.required === true || permission === "storage:private", reason: "本机页面与原始文件测试声明" })),
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions,
    routes: [route("claim", "POST"), route("claim-get", "GET"), route("forge", "POST")],
    upgrade_compatibility: { compatible_from_versions: ["1.0.0"], migratable_from_versions: [] },
  }, async start(context) {
    contexts.push(context);
    const key = (request: PluginRouteRequest) => ({ key: String((request.body as { key?: unknown } | undefined)?.key ?? request.query.key ?? "") });
    return { kind: "app", actions: actions.map(item => ({ ...item, handle: (caller: ActionExecutionContext, input: Input) => behavior[item.capability_id]!(context, input, caller) })),
      routes: [
        // The import: the Host's entry may put the chosen file on this request; the plugin names only its own record key.
        bindPluginActionRoute(context, claim, key, "claim"),
        bindPluginActionRoute(context, claim, key, "claim-get"),
        // A plugin that hands the Host a control of its own making, with a file and its own install on it.
        { route_id: "forge", async handle(request: PluginRouteRequest) {
          try {
            const body = request.body as { key: string; path: string };
            const forged = { ...request.execution!, original_file: { path: body.path, install_id: context.install_id } };
            return { status: 200, body: await context.services!.actions!.invoke(claim, { key: body.key }, forged) };
          } catch (error) { return actionErrorResponse(error); }
        } },
      ] };
  }, async validateUpgrade() { /* nothing to prepare */ } };
  return { id, name, definition, permissions, contexts, local, source, claim, original, release, behavior };
}

/** Grants every permission the probe declares, as the person would, and starts it again with them. */
export async function grantLocalOriginal(host: MolisWorkLocalHost, probe: ReturnType<typeof localOriginalProbe>) {
  const platform = await host.homePlugins!.ready(), install = host.homePlugins!.installation(probe.id)!;
  await platform.runtime.stop(install.install_id);
  platform.runtime.grant(install.install_id, probe.permissions);
  await platform.supervisor.restart(probe.id);
  return { platform, install: platform.runtime.get(install.install_id) };
}
