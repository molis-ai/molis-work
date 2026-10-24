import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { createDesktopWebHost, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference, type WebServerOptions } from "@molis-ai/molis-work-app-local-host";
import { LOCAL_PERSON_ACTOR_ID, type ActionCallContext, type ActionDefinition, type ActionExecutionContext, type ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import { defineInstructionPrompt, instructed } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import type { PluginDefinition, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { bindPluginActionRoute } from "@molis-ai/molis-work-plugin-sdk";
import { createProject, LocalHostHttpClient } from "@molis-ai/molis-work-test-kit/local-host-http";

export const deferred = () => { let resolve!: () => void; return { promise: new Promise<void>(done => { resolve = done; }), resolve }; };
export const person = (permissions: readonly string[], projectId: string | null = null): ActionCallContext =>
  ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: projectId, audience: "user", permissions });

async function within(name: string, operation: Promise<unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { await Promise.race([operation, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Home fixture cleanup timed out: ${name}`)), 5_000); })]); }
  finally { clearTimeout(timer); }
}

/** An isolated Host behind the actual desktop HTTP composition, with the Catalog's directory list. No store writes or grant shortcuts. */
export async function serveHomeRuntime(t: TestContext, options: NonNullable<ConstructorParameters<typeof MolisWorkLocalHost>[0]> = {}, webOptions: Pick<WebServerOptions, "chooseDirectory"> = {}) {
  const home = options.homeDirectory ?? await mkdtemp(join(tmpdir(), "home-runtime-"));
  let host: MolisWorkLocalHost | undefined, server: ReturnType<ReturnType<typeof createDesktopWebHost>> | undefined;
  t.after(async () => {
    const failures: unknown[] = [];
    const closeServer = () => {
      if (!server?.listening) return;
      const closed = new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
      server.closeAllConnections(); return closed;
    };
    for (const [name, cleanup] of [["HTTP server", closeServer], ["Local Host", () => host?.close()], ["temporary Home", () => rm(home, { recursive: true, force: true })]] as const) {
      try { await within(name, Promise.resolve(cleanup())); } catch (error) { failures.push(error); }
    }
    if (failures.length) throw new AggregateError(failures, "Home runtime fixture cleanup failed");
  });
  const workspaceFor = options.workspaceFor;
  host = new MolisWorkLocalHost({
    homeDirectory: home, completeText: null,
    // A supplied single-folder port remains the authority; explicit list options below still win, including an intentional undefined.
    workspacesFor: workspaceFor
      ? async projectId => { const workspace = await workspaceFor(projectId); return workspace === null ? [] : [workspace]; }
      : projectId => withMolisWorkProjectCatalog({ homeDirectory: home }, catalog => catalog.listWorkspaceDirectory(projectId)),
    ...options,
  });
  const token = randomUUID();
  server = createDesktopWebHost({ ptyClientFilePath: () => "" })({ homeDirectory: home, localHost: host, controlToken: token, ...webOptions });
  await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`, web = new LocalHostHttpClient({ origin, controlToken: token });
  return { home, host, origin, token,
    request:(path: string, input: { method?: string; body?: unknown; raw?: string; authorized?: boolean; headers?: Record<string, string>; signal?: AbortSignal } = {}) => fetch(origin + path, {
      signal: input.signal,
      method: input.method ?? "GET", headers: { origin, "content-type": "application/json", "x-molis-work-idempotency-key": randomUUID(),
        ...(input.authorized === false ? {} : { "x-molis-work-control-token": token }), ...input.headers },
      ...(input.raw !== undefined ? { body: input.raw } : input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
    }),
    async project(title: string) {
      const project = await createProject(web, title);
      return { ...project, reference: molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id }) };
    },
  };
}

/** A Home definition with optional business grants: being a fixture does not grant read/write/model/configuration. */
export function homeProbe(name = "homeprobe", version = "1.0.0") {
  const id = `io.molis.work.example.${name}`, read = `${name}:read`, write = `${name}:write`, configure = `${name}:configure`;
  const permissions = ["storage:private", read, write, configure, "model:invoke"];
  const contexts: PluginStartContext[] = [], stopped: unknown[] = [];
  const instruction = defineInstructionPrompt({ owner_id: id, prompt_id: "summarize", version: 1, title: "Home 摘要", purpose: "概括本次材料",
    used_by: ["Home 探针"], body: "用一句话概括材料。" });
  const action = <Input, Output>(suffix: string, scope: "home" | "project", required: string[], operation: "query" | "command", input: ActionSchema): ActionDefinition<Input, Output> =>
    ({ capability_id: `${name}.${suffix}`, version: 1, operation, action: { title: suffix, description: "Home 实例的真实动作", scope, permissions: required,
      kind: operation === "query" ? "query" : "operation", audiences: ["user", "mcp"], subject_kinds: [], input_schema: input } });
  const empty = { type: "object", additionalProperties: false };
  const state = action<Record<string, never>, { value: string | null; project_id: string | null }>("state", "home", [read], "query", empty);
  const save = action<{ text: string }, string>("save", "home", [write], "command", { type: "object", additionalProperties: false, required: ["text"], properties: { text: { type: "string" } } });
  const project = action<Record<string, never>, string>("project", "project", [read], "query", empty);
  const serial = action<Record<string, never>, string>("serial", "home", ["model:invoke"], "command", empty);
  const ask = { ...serial, capability_id: `${name}.ask`, action: { ...serial.action, scheduling: "concurrent" as const } };
  const scenes = (["home", "project"] as const).map(scope => ({ scene_id: `${name}.${scope}-review`, version: 1, title: `${scope} 审核位置`, description: "Home 提供方的消费场景",
    trigger: "读取材料", scope, permissions: [read], configuration_permissions: [configure], subject_kinds: [], input_schema: empty, result_schema: empty }));
  const seen: Array<Pick<ActionExecutionContext, "project_id" | "page_context">> = [];
  const behavior = { ask: async (context: PluginStartContext) => (await context.services!.model!.complete(instructed(instruction, "  原始材料\n"))).text,
    stop: async (_context: PluginStartContext) => {} };
  const definition: PluginDefinition = { manifest: { schema_version: 2, host_api_version: 2, plugin_id: id, version, name, kind: "app",
    publisher: { publisher_id: "example", signature: `home-${name}` }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: permissions.map(permission => ({ permission, required: permission === "storage:private", reason: "Home 探针的声明授权" })),
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
    actions: [state, save, project, ask, serial], action_scenes: scenes,
    routes: [{ route_id: "state", method: "GET", path: "/state", permission: read }, { route_id: "save", method: "POST", path: "/save", permission: write },
      { route_id: "project", method: "GET", path: "/project", permission: read }, { route_id: "ask", method: "POST", path: "/ask", permission: "model:invoke" }],
    upgrade_compatibility: { compatible_from_versions: ["1.0.0"], migratable_from_versions: [] } }, instructions: [instruction],
    async start(context) {
      contexts.push(context);
      return { kind: "app", actions: [
        { ...state, handle(caller) { seen.push({ project_id: caller.project_id, page_context: caller.page_context }); return { value: context.services!.storage!.get("note"), project_id: caller.project_id }; } },
        { ...save, async handle(caller, input) { await caller.beforeEffect(); context.services!.storage!.set("note", (input as { text: string }).text); return "stored"; } },
        { ...project, handle: caller => caller.project_id },
        ...[ask, serial].map(action => ({ ...action, handle: () => behavior.ask(context) })),
      ], routes: [bindPluginActionRoute(context, state, () => ({}), "state"), bindPluginActionRoute(context, save, request => request.body as { text: string }, "save"),
        bindPluginActionRoute(context, project, () => ({}), "project"), bindPluginActionRoute(context, ask, () => ({}), "ask")],
        action_scenes: scenes.map(scene => ({ ...scene, targets: () => [{ binding_id: "original", title: `${name} 原配置位置`, revision: null }], bindings: () => [], bind: () => {}, consume: () => ({}) })) };
    },
    async stop(context) {
      let refusal: unknown;
      try { context.services!.storage!.set("after-stop", "refused"); } catch (error) { refusal = error; }
      assert.ok(refusal instanceof Error && "code" in refusal, "the real stop hook must lose its storage authority");
      assert.equal(refusal.code, "actions.forbidden");
      stopped.push(refusal); await behavior.stop(context);
    },
  };
  return { id, definition, state, save, project, ask, serial, scenes, permissions, contexts, stopped, instruction, behavior, seen };
}

export async function grantHomeProbe(host: MolisWorkLocalHost, probe: ReturnType<typeof homeProbe>, grants = probe.permissions) {
  const platform = await host.homePlugins!.ready(), install = host.homePlugins!.installation(probe.id)!;
  await platform.runtime.stop(install.install_id);
  platform.runtime.grant(install.install_id, grants);
  await platform.supervisor.restart(probe.id);
  assert.equal(host.homePlugins!.installation(probe.id)!.state, "running");
  return { platform, install: platform.runtime.get(install.install_id) };
}
