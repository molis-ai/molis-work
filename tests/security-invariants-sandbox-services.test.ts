import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { HOST_SERVICE_PERMISSIONS, HomePluginHost, LocalHost, LocalProjectDatabase, PluginHostExecutor } from "@molis-ai/molis-work-app-local-host";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginManifest, PluginPrivateStorage, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { assertSandboxDeclarations, sandboxServicesFor, SANDBOX_NOT_GIVEN, SANDBOX_SERVICE_FATE, type NotGiven, type SandboxDeclarations, type SandboxServiceFate } from "@molis-ai/molis-work-plugin-sandbox";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { homeProbe } from "./fixtures/home-runtime.js";

// S-60 (PG-017, specs/repository-anti-corruption/slices/pg017-sandbox-services.md): a sandboxed plugin is an install trust, not a second set
// of permissions. The services it reaches are the ones the Host built for the activation from its Manifest and the person's grants, forwarded
// through the broker. What the sandbox is not given is a refusal with a code when the installation starts, never a silent absence. This file
// asserts those refusals; the per-service ones (over-reach, unapproved, after revoke) sit beside each service as it is given.

const PLUGIN_ID = "io.molis.work.example.sbxservices";
const NOT_GIVEN = { code: "sandbox.service_not_given" } as const;
const MODEL_CONFIGURATION: NonNullable<PluginManifest["model_configuration"]> = {
  preference: { store_name: "sandbox-model-settings", file_name: "model.json" }, custom_provider: { provider_id: "sandbox-model", display_name: "Sandbox model" },
  actions: { read: { capability_id: "sandbox-model.read", version: 1 }, save: { capability_id: "sandbox-model.save", version: 1 } },
};

const manifest = (extra: Partial<PluginManifest> = {}, permissions: PluginManifest["permissions"] = []): PluginManifest => ({
  schema_version: 2, host_api_version: 2, plugin_id: PLUGIN_ID, version: "1.0.0", name: "Sandbox services probe", kind: "app",
  publisher: { publisher_id: "example", signature: "probe-sbxservices" }, entrypoints: [{ deployment: "local", entrypoint: "./index.mjs" }],
  permissions: [{ permission: "storage:private", required: true, reason: "keeps its own data" }, ...permissions],
  capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, ...extra,
});
const permission = (name: string, required: boolean) => ({ permission: name, required, reason: "probe" });
const declaring = (extra: Partial<SandboxDeclarations> = {}, manifestExtra: Partial<PluginManifest> = {}, permissions: PluginManifest["permissions"] = []): SandboxDeclarations =>
  ({ manifest: manifest(manifestExtra, permissions), ...extra });

test("S-60 RAC-238 a sandboxed plugin asking for a service the sandbox is not given is refused with a code, naming the service", () => {
  const asks: Array<[string, SandboxDeclarations, readonly string[]]> = [
    ["model_configuration", declaring({}, { model_configuration: MODEL_CONFIGURATION }, [permission("model:invoke", false)]), []],
    ["model_configuration", declaring({}, { model_configuration: MODEL_CONFIGURATION }, [permission("model:invoke", true)]), ["model:invoke"]],
    ["materials", declaring({}, {}, [permission("materials:fetch", true)]), []],
    ["materials", declaring({}, {}, [permission("materials:fetch", false)]), ["materials:fetch"]],
    ["background", declaring({}, { background: { jobs: [{ job_id: "probe" } as never] } }), []],
    ["agent", declaring({ agent_prompts: [{ prompt_id: "probe", version: 1, body: "probe", layer: "role" }] }), []],
    ["agent", declaring({ methods: [{ method_id: "probe", version: 1 } as never] }), []],
    ["agent", declaring({}, { agent: { roles: [], prompts: [] } }), []],
    ["directory", declaring({}, {}, [permission("directory:read", true)]), []],
    ["scheduler", declaring({}, {}, [permission("schedule:read", true)]), []],
    ["scheduler", declaring({}, {}, [permission("schedule:write", false)]), ["schedule:write"]],
    ["agents", declaring({}, {}, [permission("agent:run", true)]), []],
    ["notifications", declaring({}, {}, [permission("notifications:write", true)]), []],
    ["installations", declaring({}, {}, [permission("plugins:read", true)]), []],
    ["actions", declaring({}, {}, [permission("actions:delegate", true)]), []],
    // Project artifacts, process items, ports and events: each declaration, and the artifact permissions, ask for the services the sandbox is not given.
    ["artifacts", declaring({}, { artifacts: { produces: [{ type: "probe" } as never], consumes: [] } }), []],
    ["artifacts", declaring({}, { artifacts: { produces: [], consumes: [{ type: "probe" } as never] } }), []],
    ["artifacts", declaring({}, { process_items: { produces: [{ type: "probe" } as never], consumes: [] } }), []],
    ["artifacts", declaring({}, { ports: { inputs: [{ port_id: "probe" } as never], outputs: [] } }), []],
    ["artifacts", declaring({}, { ports: { inputs: [], outputs: [{ port_id: "probe" } as never] } }), []],
    ["artifacts", declaring({}, { events: { publishes: [{ event: "probe" } as never], subscribes: [] } }), []],
    ["artifacts", declaring({}, { events: { publishes: [], subscribes: [{ event: "probe" } as never] } }), []],
    ["artifacts", declaring({}, {}, [permission("artifact:write", true)]), []],
  ];
  for (const [service, definition, held] of asks) {
    assert.throws(() => assertSandboxDeclarations(definition, held), error => (error as { code?: string }).code === NOT_GIVEN.code
      && new RegExp(`asks for ${service}:`).test((error as Error).message), `${service} must be refused`);
  }
});

test("S-60 RAC-238 an optional permission the person did not approve is not an ask, and what the sandbox is given passes", () => {
  assert.doesNotThrow(() => assertSandboxDeclarations(declaring({}, {}, [permission("directory:read", false), permission("materials:read", false)]), ["storage:private"]));
  // The model and the package's own instructions are given (PG-017 P1, tests/security-invariants-sandbox-model.test.ts): declaring them is not refused.
  assert.doesNotThrow(() => assertSandboxDeclarations(declaring({ instructions: [{ prompt_id: "probe", version: 1, owner_id: PLUGIN_ID, title: "probe", body: "probe", layer: "task" } as never] },
    {}, [permission("model:invoke", true), permission("model:read", true)]), ["model:invoke", "model:read"]));
  // Reads of bytes are given (PG-017 P2, tests/security-invariants-sandbox-materials.test.ts): materials:read is not refused.
  assert.doesNotThrow(() => assertSandboxDeclarations(declaring({}, {}, [permission("materials:read", true)]), ["materials:read"]));
  // Connections are given (PG-017 P2, tests/security-invariants-sandbox-connections.test.ts): declaring a slot is not refused.
  assert.doesNotThrow(() => assertSandboxDeclarations(declaring({}, { connections: { slots: [{ slot_id: "github", service_id: "github", reason: "probe" }] } }, [permission("connections:use", true)]), ["connections:use"]));
  // A run a command starts is given (PG-017 P3, tests/security-invariants-sandbox-background.test.ts): `background_job` on an action is not refused; the kept jobs of the Manifest still are.
  assert.doesNotThrow(() => assertSandboxDeclarations(declaring({}, { actions: [{ action: { background_job: { label: "probe" } } } as never] }), []));
  assert.doesNotThrow(() => assertSandboxDeclarations(declaring(), ["storage:private"]));
  // The project's own tables are given (S-59): declaring them is not refused.
  assert.doesNotThrow(() => assertSandboxDeclarations(declaring({}, { databases: { project: { store_name: "probe", version: 1, read_permission: "probe:read", write_permission: "probe:write", schema: "CREATE TABLE probe_rows (id INTEGER PRIMARY KEY);" } } },
    [permission("probe:read", true), permission("probe:write", true)]), ["probe:read", "probe:write"]));
  // A library in the Home is given on the Home Runtime (BL-490, tests/security-invariants-sandbox-home-database.test.ts): declaring one is not refused here.
  assert.doesNotThrow(() => assertSandboxDeclarations(declaring({}, { databases: { home: { store_name: "probehome", version: 1, read_permission: "probe:read", write_permission: "probe:write", schema: "CREATE TABLE probehome_rows (id INTEGER PRIMARY KEY);" } } },
    [permission("probe:read", true), permission("probe:write", true)]), ["probe:read", "probe:write"]));
});

test("S-60 the broker's services are the ones the Host built for the activation, and storage is required", () => {
  const storage: PluginPrivateStorage = { get: () => null, set: () => {}, delete: () => false, compareAndSet: () => true };
  const interaction = { questionHtml: () => "", cardHtml: () => "", nextStepsHtml: () => "" } as never;
  const statements = { get: async () => null, all: async () => [], transaction: async () => [] } as never;
  assert.deepEqual(Object.keys(sandboxServicesFor({ storage })), ["storage"]);
  assert.deepEqual(Object.keys(sandboxServicesFor({ storage, project_statements: statements, interaction })).sort(), ["interaction", "projectDatabase", "storage"]);
  assert.deepEqual(Object.keys(sandboxServicesFor({ storage }, { network: { request: async () => ({}) as never } })).sort(), ["network", "storage"]);
  const connections = { request: async () => ({ status: 200, headers: {}, body: "", authenticated: false }) };
  assert.deepEqual(Object.keys(sandboxServicesFor({ storage, connections })).sort(), ["connections", "storage"]);
  assert.deepEqual(Object.keys(sandboxServicesFor({ storage, materials: Object.freeze({}) })).sort(), ["materials", "storage"]);
  assert.throws(() => sandboxServicesFor({}), /尚未装配/);
  assert.throws(() => sandboxServicesFor(undefined), /尚未装配/);
});

/** Whether a package that asks for `name` is refused with the code. */
function refuses(name: string): boolean {
  try { assertSandboxDeclarations({ manifest: manifest({}, [permission(name, true)]) }, []); return false; } catch (error) { return (error as { code?: string }).code === NOT_GIVEN.code; }
}

/** What nobody decided: a permission of `table` whose service the sandbox neither gives nor refuses by a row, and a row for a service it does not refuse. */
function unclassified(table: Readonly<Record<string, readonly string[] | undefined>>, fates: Readonly<Record<string, SandboxServiceFate>>, rows: readonly NotGiven[]): string[] {
  const permissions = Object.entries(table).flatMap(([service, names]) => (names ?? []).filter(name => fates[service] === "given" ? false : fates[service] !== "refused" || !refuses(name)).map(name => `${service}/${name}`));
  return [...permissions, ...rows.filter(row => row.services.some(service => fates[service] !== "refused")).map(row => `row ${row.service}`)];
}

test("S-60 RAC-238 every permission the Host builds a service for is given to the sandbox or refused by a row; an unclassified one fails here", () => {
  assert.deepEqual(unclassified(HOST_SERVICE_PERMISSIONS, SANDBOX_SERVICE_FATE, SANDBOX_NOT_GIVEN), []);
  // The check can fail: a permission added to a service without a decision for the sandbox, a service decided as refused that no row refuses, a row for a service the sandbox gives.
  assert.deepEqual(unclassified({ ...HOST_SERVICE_PERMISSIONS, agents: [...HOST_SERVICE_PERMISSIONS.agents!, "agent:probe"], scheduler: ["schedule:probe"] }, SANDBOX_SERVICE_FATE, SANDBOX_NOT_GIVEN),
    ["scheduler/schedule:probe", "agents/agent:probe"]);
  assert.deepEqual(unclassified({ probe: ["probe:use"] }, { ...SANDBOX_SERVICE_FATE, probe: "entry" }, []), ["probe/probe:use"]);
  assert.deepEqual(unclassified({}, { ...SANDBOX_SERVICE_FATE, scheduler: "given" }, SANDBOX_NOT_GIVEN), ["row scheduler"]);
  // Every service of the Host is decided (the type makes a new one fail to compile), and each row's services are the ones decided as refused.
  const refused = Object.entries(SANDBOX_SERVICE_FATE).filter(([, fate]) => fate === "refused").map(([service]) => service).sort();
  assert.deepEqual(SANDBOX_NOT_GIVEN.flatMap(row => row.services).sort(), refused, "every refused service is named by exactly one row");
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
  const definition = (id: string, execution: PluginDefinition["execution"], modelConfiguration = false): PluginDefinition => ({
    manifest: { ...manifest(modelConfiguration ? { model_configuration: MODEL_CONFIGURATION } : {}, [permission(modelConfiguration ? "model:invoke" : "directory:read", true)]), plugin_id: id }, ...(execution ? { execution } : {}),
    async start(context: PluginStartContext) { started.push(context.plugin_id); return { kind: "app" }; },
  });
  const grants = ["storage:private", "directory:read"];
  const sandboxed = runtime.install({ definition: definition(`${PLUGIN_ID}.boxed`, "sandbox"), deployment: "local", grants }).install;
  const hosted = runtime.install({ definition: definition(`${PLUGIN_ID}.hosted`, undefined), deployment: "local", grants }).install;
  // The Runtime reduces an opaque start failure to a safe message and keeps the code on the installation's record.
  await assert.rejects(runtime.start(sandboxed.install_id), { code: "plugin.executor_failed" });
  assert.deepEqual({ state: runtime.get(sandboxed.install_id).state, code: runtime.get(sandboxed.install_id).last_error_code }, { state: "crashed", code: NOT_GIVEN.code });
  assert.deepEqual(started, [], "the sandboxed plugin's start never ran");
  // A project's platform has no process to run a sandboxed package's Home statements in: a package that declares a library there is stopped before its code starts (BL-490).
  const homeLibrary = { store_name: "sbxhomelib", version: 1, read_permission: "sbxhomelib:read", write_permission: "sbxhomelib:write", schema: "CREATE TABLE sbxhomelib_rows (id INTEGER PRIMARY KEY);" };
  const withHome = runtime.install({ definition: { ...definition(`${PLUGIN_ID}.withhome`, "sandbox"), manifest: { ...manifest({ databases: { home: homeLibrary } }, [permission(homeLibrary.read_permission, true), permission(homeLibrary.write_permission, true)]), plugin_id: `${PLUGIN_ID}.withhome` } },
    deployment: "local", grants: ["storage:private", homeLibrary.read_permission, homeLibrary.write_permission] }).install;
  await assert.rejects(runtime.start(withHome.install_id), { code: "plugin.executor_failed" });
  assert.equal(runtime.get(withHome.install_id).state, "crashed");
  assert.equal(runtime.get(withHome.install_id).last_error_code, "plugin.declaration_invalid");
  assert.deepEqual(started, [], "the package that declares a Home library never started in a project");
  const configured = runtime.install({ definition: definition(`${PLUGIN_ID}.configured`, "sandbox", true), deployment: "local", grants: ["storage:private", "model:invoke"] }).install;
  await assert.rejects(runtime.start(configured.install_id), { code: "plugin.executor_failed" });
  assert.equal(runtime.get(configured.install_id).last_error_code, NOT_GIVEN.code, "model_configuration is refused with the S-60 code before services are built");
  assert.deepEqual(started, [], "a model_configuration declaration cannot silently start without its port");
  await runtime.start(hosted.install_id);
  assert.deepEqual(started, [`${PLUGIN_ID}.hosted`]);
  await runtime.stop(hosted.install_id);
});

test("S-60 RAC-238 the Home Runtime stops a sandboxed installation that asks for a service the sandbox is not given before its code starts", { timeout: 30_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "sandbox-services-home-"));
  const actions = new ActionService();
  const boxed = homeProbe("sbxboxed"), hosted = homeProbe("sbxhosted");
  const host = new HomePluginHost({ home, actorId: LOCAL_PERSON_ACTOR_ID, registry: actions, client: actions, entries: [], fixtures: [hosted.definition] });
  t.after(async () => { try { await host.close(); } finally { await rm(home, { recursive: true, force: true }); } });
  const { runtime } = await host.ready();
  // A sandboxed package is installed with the person's grants; it is never a start-list entry or a fixture.
  // The probe's model and instructions are given; a folder of the person's (directory:read) is not, so it is what the package asks for.
  boxed.definition.manifest.permissions.push({ permission: "directory:read", required: true, reason: "probe" });
  const { install } = runtime.install({ definition: { ...boxed.definition, execution: "sandbox" }, deployment: "local", grants: ["storage:private", "model:invoke", "directory:read"] });
  await assert.rejects(runtime.start(install.install_id), { code: "plugin.executor_failed" });
  assert.deepEqual({ state: runtime.get(install.install_id).state, code: runtime.get(install.install_id).last_error_code }, { state: "crashed", code: NOT_GIVEN.code });
  assert.equal(boxed.contexts.length, 0, "the sandboxed plugin's start never ran");
  const configured = homeProbe("sbxmodelconfiguration");
  configured.definition.manifest.model_configuration = { ...MODEL_CONFIGURATION, actions: { read: configured.state, save: configured.save } };
  const modelInstall = runtime.install({ definition: { ...configured.definition, execution: "sandbox" }, deployment: "local", grants: ["storage:private", "model:invoke"] }).install;
  await assert.rejects(runtime.start(modelInstall.install_id), { code: "plugin.executor_failed" });
  assert.equal(runtime.get(modelInstall.install_id).last_error_code, NOT_GIVEN.code, "Home uses the same refusal instead of a later generic declaration error");
  assert.equal(configured.contexts.length, 0, "the model_configuration plugin's start never ran");
  assert.equal(host.installation(hosted.id)?.state, "running");
  assert.equal(hosted.contexts.length, 1, "a plugin the Host runs itself is not stopped");
});
