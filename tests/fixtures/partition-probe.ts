import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { HomePluginHost, PLATFORM_PLUGIN_REGISTRATIONS, projectDeletedHooksFor, type HomePluginEntry } from "@molis-ai/molis-work-app-local-host";
import { LOCAL_PERSON_ACTOR_ID, type ActionCallContext, type ActionDefinition, type ActionExecutionContext, type ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ProjectDataDeclaration } from "@molis-ai/molis-work-contracts/modules/projects";
import type { HomePluginDatabaseDeclaration, PluginBackgroundExecution, PluginDatabase, PluginDefinition, PluginExecutionControl, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { withLibrary } from "./home-library.js";
import { person } from "./home-runtime.js";

// A Home plugin whose library is partitioned by project (specs/plugin-project-partition), shipped the way a built-in one is: an entry
// in the platform's registration list (`PLATFORM_PLUGIN_REGISTRATIONS`, the Host's own since W5-02 PR-B). The Home's store registry is made from the catalog once per process, so the entry is added when this
// module loads, before anything asks for the registry, and stays for the test file's process.

export const PROBE = "partprobe";
export const PROBE_ID = `io.molis.work.example.${PROBE}`;
const READ = `${PROBE}:read`, WRITE = `${PROBE}:write`;
export const PROBE_PERMISSIONS = ["storage:private", READ, WRITE] as const;
export const PROBE_DATABASE: HomePluginDatabaseDeclaration = { store_name: PROBE, version: 1, read_permission: READ, write_permission: WRITE, partition: "project",
  schema: "CREATE TABLE notes (id INTEGER PRIMARY KEY, text TEXT NOT NULL);" };

const empty: ActionSchema = { type: "object", additionalProperties: false };
const byId: ActionSchema = { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "string", minLength: 1 } } };
const define = <Input, Output>(suffix: string, operation: "query" | "command", scope: "home" | "project", permissions: string[], input: ActionSchema = empty,
  extra: Partial<ActionDefinition["action"]> = {}): ActionDefinition<Input, Output> => ({ capability_id: `${PROBE}.${suffix}`, version: 1, operation,
  action: { title: suffix, description: "分区探针的动作", kind: operation === "query" ? "query" : "operation", scope, audiences: ["user"], subject_kinds: [],
    permissions, input_schema: input, ...extra } });

/** Writes one note; `project_id` in the input is there to show it is not where the note goes. */
export const write = define<{ text: string; project_id?: string }, string>("write", "command", "project", [WRITE],
  { type: "object", additionalProperties: false, required: ["text"], properties: { text: { type: "string" }, project_id: { type: "string" } } }, { scheduling: "concurrent" });
export const read = define<Record<string, never>, unknown>("read", "query", "project", [READ]);
/** The same read as a Home action: called in no project. */
export const homeRead = define<Record<string, never>, unknown>("home-read", "query", "home", [READ]);
export const laterStatus = define<{ id: string }, { state: string }>("later-status", "query", "project", [READ], byId,
  { output_schema: { type: "object", required: ["state"], additionalProperties: false, properties: { state: { enum: ["running", "succeeded", "failed"] } } } });
/** Accepts a job that writes later, in the background. */
export const later = define<{ id: string }, { id: string; state: string }>("later", "command", "project", [WRITE], byId, { scheduling: "concurrent",
  output_schema: { type: "object", required: ["id", "state"], additionalProperties: false, properties: { id: { type: "string" }, state: { enum: ["running", "succeeded", "failed"] } } },
  background_job: { status: { capability_id: laterStatus.capability_id, version: laterStatus.version }, id: "id", input: "id", state: "state", done: ["succeeded"], failed: ["failed"] } });

/** The probe's read: the notes' texts in the order they were written. */
export const noteTexts = (database: PluginDatabase) => database.all("SELECT text FROM notes ORDER BY id").map(row => row.text);
/** The probe's write: one note, after `probe.hold` and the caller's `beforeEffect`. */
export const storeNote = (database: PluginDatabase, text: string, caller: ActionExecutionContext): Promise<unknown> =>
  database.transaction(async () => { await probe.hold(text, caller); await caller.beforeEffect(); }, tx => tx.run("INSERT INTO notes (text) VALUES (?)", [text]));

/** What the probe does, changed by each test; `reset` puts it back. */
export const probe = {
  contexts: [] as PluginStartContext[],
  jobs: [] as PluginBackgroundExecution<void>[],
  /** Each accepted job's control, in the order the jobs began to run. */
  controls: [] as PluginExecutionControl[],
  trace: [] as string[],
  startRefusal: undefined as unknown,
  /** Runs inside the write's `beforeEffect`, before the caller's own. */
  hold: async (_text: string, _caller: ActionExecutionContext): Promise<void> => {},
  write: storeNote,
  beforeRead: async (): Promise<void> => {},
  read: (database: PluginDatabase): unknown => noteTexts(database),
  later: Promise.resolve(),
  purge: (_home: string, projectId: string): void | Promise<void> => { probe.trace.push(`purge:${projectId}`); },
  reset() {
    Object.assign(probe, { contexts: [], jobs: [], controls: [], trace: [], startRefusal: undefined, hold: async () => {}, write: storeNote, beforeRead: async () => {},
      read: noteTexts, later: Promise.resolve(), purge: (_home: string, projectId: string) => { probe.trace.push(`purge:${projectId}`); } });
  },
  database: (): PluginDatabase => probe.contexts.at(-1)?.services?.database ?? assert.fail("the probe was given no services.database"),
};

function createProbe(): PluginDefinition {
  const actions = [write, read, homeRead, later, laterStatus];
  return { manifest: { schema_version: 2, host_api_version: 2, plugin_id: PROBE_ID, version: "1.0.0", name: PROBE, kind: "app",
    publisher: { publisher_id: "example", signature: `home-${PROBE}` }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: PROBE_PERMISSIONS.map(permission => ({ permission, required: true, reason: "分区探针读写自己的库" })),
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions, databases: { home: PROBE_DATABASE },
    upgrade_compatibility: { compatible_from_versions: ["1.0.0"], migratable_from_versions: [] } },
  async start(context) {
    probe.contexts.push(context);
    try { context.services!.database!.get("SELECT 1"); } catch (error) { probe.startRefusal = error; }
    const database = () => context.services!.database!;
    return { kind: "app", views: [], actions: [
      { ...write, async handle(caller, input) { await probe.write(database(), (input as { text: string }).text, caller); return "stored"; } },
      ...[read, homeRead].map(definition => ({ ...definition, async handle() { await probe.beforeRead(); return probe.read(database()); } })),
      { ...laterStatus, handle: () => ({ state: "running" }) },
      { ...later, async handle(_caller, input) {
        const { id } = input as { id: string };
        probe.jobs.push(await context.services!.background!.start(async control => {
          probe.controls.push(control);
          await probe.later;
          await database().transaction(control.beforeEffect, tx => tx.run("INSERT INTO notes (text) VALUES (?)", [`later:${id}`]));
        }));
        return { id, state: "running" };
      } },
    ] };
  } };
}

const projectData: ProjectDataDeclaration = { label: "分区探针在这个项目里的笔记", purge: (home, projectId) => probe.purge(home, projectId) };
const catalog = PLATFORM_PLUGIN_REGISTRATIONS as PluginRegistration[];
const todo = catalog.find(entry => entry.project_plugin_id === "todo")?.runtime;
assert.ok(todo, "the Todo entry lends its package for the Runtime's release archive");
const shipped = createProbe();
catalog.push({ project_plugin_id: PROBE, catalog_order: 10_000, manifest: shipped.manifest, project_data: projectData,
  runtime: { scope: "home", create: createProbe, package_name: todo.package_name, factory_export: todo.factory_export },
  workbench: { order: 10_000, contributions: [] } });

/** The probe, declaring `library` as its Home library instead of the catalog's (or none): what a Manifest that disagrees with the registry looks like. */
export function probeWithLibrary(library: HomePluginDatabaseDeclaration | undefined): () => PluginDefinition {
  return () => withLibrary(createProbe(), library);
}

/** The Home entry the Host makes of a catalog entry (project-host.ts), with what a test changes about it. */
export function probeEntry(change: Partial<HomePluginEntry> = {}): HomePluginEntry {
  const entry = catalog.find(item => item.project_plugin_id === PROBE)!;
  return { ...entry.runtime!, manifest: entry.manifest, project_data: { owner_id: PROBE, declaration: entry.project_data! }, ...change };
}

/** The probe's library of a project, where the Host puts it. */
export const partitionDirectory = (home: string, projectId: string) => join(home, PROBE, "projects", encodeURIComponent(projectId).replaceAll(".", "%2E"));
export const partitionFile = (home: string, projectId: string) => join(partitionDirectory(home, projectId), `${PROBE}.db`);

/** A temporary Home with the Home plugin Host over the kernel's action service, the way the Host composes it. */
export function partitionHome(t: TestContext, entries: readonly HomePluginEntry[] = [probeEntry()], homeDirectory?: string) {
  probe.reset();
  const home = homeDirectory ?? mkdtempSync(join(tmpdir(), "plugin-partition-")), actions = new ActionService();
  const host = new HomePluginHost({ home, actorId: LOCAL_PERSON_ACTOR_ID, registry: actions, client: actions, entries });
  t.after(async () => { try { await host.close(); } finally { rmSync(home, { recursive: true, force: true }); } });
  return { home, host, actions, hooks: projectDeletedHooksFor(home),
    invoke: (definition: ActionDefinition, input: unknown, projectId: string | null, call: Partial<ActionCallContext> = {}) =>
      actions.invoke({ ...person([...PROBE_PERMISSIONS], projectId), ...call }, definition, input),
    async ready() {
      const platform = await host.ready(), record = host.installation(PROBE_ID);
      assert.ok(record); assert.equal(record.state, "running", platform.supervisor.state(PROBE_ID)?.error);
      return { platform, record };
    } };
}
