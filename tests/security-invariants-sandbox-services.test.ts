import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LocalHost, LocalProjectDatabase, PluginHostExecutor } from "@molis-ai/molis-work-app-local-host";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginManifest, PluginPrivateStorage, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { assertSandboxDeclarations, sandboxServicesFor, type SandboxDeclarations } from "@molis-ai/molis-work-plugin-sandbox";
import { UiHost } from "@molis-ai/molis-work-ui-host";

// S-60 (PG-017, specs/repository-anti-corruption/slices/pg017-sandbox-services.md): a sandboxed plugin is an install trust, not a second set
// of permissions. The services it reaches are the ones the Host built for the activation from its Manifest and the person's grants, forwarded
// through the broker. What the sandbox is not given is a refusal with a code when the installation starts, never a silent absence. This file
// asserts those refusals; the per-service ones (over-reach, unapproved, after revoke) sit beside each service as it is given.

const PLUGIN_ID = "io.molis.work.example.sbxservices";
const NOT_GIVEN = { code: "sandbox.service_not_given" } as const;

const manifest = (extra: Partial<PluginManifest> = {}, permissions: PluginManifest["permissions"] = []): PluginManifest => ({
  schema_version: 2, host_api_version: 2, plugin_id: PLUGIN_ID, version: "1.0.0", name: "Sandbox services probe", kind: "app",
  publisher: { publisher_id: "example", signature: "probe-sbxservices" }, entrypoints: [{ deployment: "local", entrypoint: "./index.mjs" }],
  permissions: [{ permission: "storage:private", required: true, reason: "keeps its own data" }, ...permissions],
  capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, ...extra,
});
const permission = (name: string, required: boolean) => ({ permission: name, required, reason: "probe" });
const declaring = (extra: Partial<SandboxDeclarations> = {}, manifestExtra: Partial<PluginManifest> = {}, permissions: PluginManifest["permissions"] = []): SandboxDeclarations =>
  ({ manifest: manifest(manifestExtra, permissions), ...extra });
const BACKGROUND_ACTION = { capability_id: "example.sbx.job", version: 1, operation: "command", background_job: { label: "probe" } } as unknown as ActionDefinition;

test("S-60 RAC-238 a sandboxed plugin asking for a service the sandbox is not given is refused with a code, naming the service", () => {
  const asks: Array<[string, SandboxDeclarations, readonly string[]]> = [
    ["model", declaring({}, {}, [permission("model:invoke", true)]), []],
    ["model", declaring({}, {}, [permission("model:read", false)]), ["model:read"]],
    ["instructions", declaring({ instructions: [{ prompt_id: "probe", version: 1, owner_id: PLUGIN_ID, title: "probe", body: "probe", layer: "task" } as never] }), []],
    ["connections", declaring({}, {}, [permission("connections:use", true)]), []],
    ["connections", declaring({}, { connections: { slots: [{ slot_id: "probe" } as never] } }), []],
    ["materials", declaring({}, {}, [permission("materials:fetch_local", true)]), []],
    ["materials", declaring({}, {}, [permission("materials:original", false)]), ["materials:original"]],
    ["background", declaring({}, { background: { jobs: [{ job_id: "probe" } as never] } }), []],
    ["background", declaring({}, { actions: [{ action: BACKGROUND_ACTION } as never] }), []],
    ["agent", declaring({ agent_prompts: [{ prompt_id: "probe", version: 1, body: "probe", layer: "role" }] }), []],
    ["agent", declaring({ methods: [{ method_id: "probe", version: 1 } as never] }), []],
    ["agent", declaring({}, { agent: { roles: [], prompts: [] } }), []],
  ];
  for (const [service, definition, held] of asks) {
    assert.throws(() => assertSandboxDeclarations(definition, held), error => (error as { code?: string }).code === NOT_GIVEN.code
      && new RegExp(`asks for ${service}:`).test((error as Error).message), `${service} must be refused`);
  }
});

test("S-60 RAC-238 an optional permission the person did not approve is not an ask, and what the sandbox is given passes", () => {
  assert.doesNotThrow(() => assertSandboxDeclarations(declaring({}, {}, [permission("model:invoke", false), permission("materials:read", false)]), ["storage:private"]));
  assert.doesNotThrow(() => assertSandboxDeclarations(declaring(), ["storage:private"]));
  // The project's own tables are given (S-59): declaring them is not refused.
  assert.doesNotThrow(() => assertSandboxDeclarations(declaring({}, { databases: { project: { store_name: "probe", version: 1, read_permission: "probe:read", write_permission: "probe:write", schema: "CREATE TABLE probe_rows (id INTEGER PRIMARY KEY);" } } },
    [permission("probe:read", true), permission("probe:write", true)]), ["probe:read", "probe:write"]));
});

test("S-60 the broker's services are the ones the Host built for the activation, and storage is required", () => {
  const storage: PluginPrivateStorage = { get: () => null, set: () => {}, delete: () => false, compareAndSet: () => true };
  const interaction = { questionHtml: () => "", cardHtml: () => "", nextStepsHtml: () => "" } as never;
  const statements = { get: async () => null, all: async () => [], transaction: async () => [] } as never;
  assert.deepEqual(Object.keys(sandboxServicesFor({ storage })), ["storage"]);
  assert.deepEqual(Object.keys(sandboxServicesFor({ storage, project_statements: statements, interaction })).sort(), ["interaction", "projectDatabase", "storage"]);
  assert.deepEqual(Object.keys(sandboxServicesFor({ storage }, { network: { request: async () => ({}) as never } })).sort(), ["network", "storage"]);
  assert.throws(() => sandboxServicesFor({}), /尚未装配/);
  assert.throws(() => sandboxServicesFor(undefined), /尚未装配/);
});

test("S-60 RAC-238 the Host stops a sandboxed installation that asks for a service the sandbox is not given before its code starts; a plugin the Host runs itself is not stopped", { timeout: 30_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "sandbox-services-"));
  const project = { project_id: "board", storage_key: join(home, "project.sqlite") };
  const store = new LocalProjectDatabase(project.storage_key);
  const artifacts = new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) });
  const processItems = new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) });
  const local = new LocalHost({ runtimeFactory: { open: () => ({ project_id: project.project_id, store, artifacts }), close: () => {} } });
  const actions = { registry: local.actionRegistry(project), client: { ...local.actionClient(project), ...local.syncActionClient(project) }, project_id: project.project_id };
  const executor = new PluginHostExecutor({ actions, project_id: project.project_id, actor_id: "web-user", artifacts, processItems, ui: new UiHost(), capabilities: local.client(project),
    privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }) });
  const runtime = new PluginRuntime(undefined, executor);
  t.after(async () => { await local.close(); store.close(); await rm(home, { recursive: true, force: true }); });
  const started: string[] = [];
  const definition = (id: string, execution: PluginDefinition["execution"]): PluginDefinition => ({
    manifest: { ...manifest({}, [permission("model:invoke", true)]), plugin_id: id }, ...(execution ? { execution } : {}),
    async start(context: PluginStartContext) { started.push(context.plugin_id); return { kind: "app" }; },
  });
  const grants = ["storage:private", "model:invoke"];
  const sandboxed = runtime.install({ definition: definition(`${PLUGIN_ID}.boxed`, "sandbox"), deployment: "local", grants }).install;
  const hosted = runtime.install({ definition: definition(`${PLUGIN_ID}.hosted`, undefined), deployment: "local", grants }).install;
  // The Runtime reduces an opaque start failure to a safe message and keeps the code on the installation's record.
  await assert.rejects(runtime.start(sandboxed.install_id), { code: "plugin.executor_failed" });
  assert.deepEqual({ state: runtime.get(sandboxed.install_id).state, code: runtime.get(sandboxed.install_id).last_error_code }, { state: "crashed", code: NOT_GIVEN.code });
  assert.deepEqual(started, [], "the sandboxed plugin's start never ran");
  await runtime.start(hosted.install_id);
  assert.deepEqual(started, [`${PLUGIN_ID}.hosted`]);
  await runtime.stop(hosted.install_id);
});
