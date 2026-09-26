import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ActionError, bindActionClient, type ActionCallContext, type ActionDefinition, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { formActions, FORM_ACTION_PERMISSIONS, createFormActionHandlers, openFormStore } from "@molis-ai/molis-work-plugin-form";
import { datasetActions, DATASET_ACTION_PERMISSIONS, openDatasetStore } from "@molis-ai/molis-work-plugin-dataset";
import { lingguangActions, LINGGUANG_ACTION_PERMISSIONS, openLingguangStore } from "@molis-ai/molis-work-plugin-lingguang";
import { pagesActions, PAGES_ACTION_PERMISSIONS, openPagesStore } from "@molis-ai/molis-work-plugin-pages";
import { cogniaActions, COGNIA_ACTION_PERMISSIONS, openCogniaStore } from "@molis-ai/molis-work-plugin-cognia";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";
import { LocalHost } from "../apps/local-host/src/local-host.js";
import { projectActionAvailability } from "../apps/local-host/src/project-action-availability.js";

const permissions = [...FORM_ACTION_PERMISSIONS, ...DATASET_ACTION_PERMISSIONS, ...LINGGUANG_ACTION_PERMISSIONS, ...PAGES_ACTION_PERMISSIONS, ...COGNIA_ACTION_PERMISSIONS];
const caller: ActionCallContext = { actor_id: "owner", audience: "user", project_id: "a", permissions };
const gate = () => Promise.withResolvers<void>();
const waitForModel = (entered: Promise<void>, pending: Promise<unknown>) => Promise.race([
  entered,
  pending.then(() => { throw new Error("Action returned before entering the model gate"); }),
]);
const errorCode = (code: string) => (error: unknown) => !!error && typeof error === "object" && "code" in error && error.code === code;

test("same public provider replacement during Form model wait cannot commit to the original SQLite store", async t => {
  const home = await mkdtemp(join(tmpdir(), "form-provider-effect-")), store = openFormStore(home);
  t.after(async () => { store.close(); await rm(home, { recursive: true, force: true }); });
  const service = new ActionService(), entered = gate(), release = gate();
  const original = store.create({ project_id: "a", title: "Original" });
  let models = 0;
  const register = () => service.registerProvider({ provider: { provider_id: "same-install", title: "Form", kind: "plugin", project_id: "a" },
    definitions: Object.values(formActions), handlers: createFormActionHandlers({ withStore: run => run(store), modelAvailability: () => ({ available: true }),
      completeText: async () => { models++; if (models === 1) { entered.resolve(); await release.promise; } return "Only the current registration may save"; } }) });
  let dispose = register();
  try {
    const pending = service.invoke(caller, formActions.generateAi, { id: original.id, prompt: "Question" });
    const rejected = assert.rejects(pending, errorCode("actions.provider_changed"));
    await entered.promise;
    dispose(); dispose = register(); release.resolve();
    await rejected;
    assert.deepEqual(store.get(original.id, "a"), original);
    const result = await service.invoke(caller, formActions.generateAi, { id: original.id, prompt: "Question" }) as { form: typeof original };
    assert.equal(result.form.questions.length, 1);
    assert.deepEqual(store.get(original.id, "a"), JSON.parse(JSON.stringify(result.form)), "original JSON storage preserves every serialized result field");
    assert.equal(models, 2);
  } finally { release.resolve(); dispose(); }
});

const definition: ActionDefinition = { capability_id: "fixture.effect", version: 1, operation: "command", action: {
  title: "Effect", description: "A deferred business commit", kind: "operation", scope: "project", audiences: ["user"], permissions: [], subject_kinds: [],
  input_schema: { type: "object", additionalProperties: false }, output_schema: { type: "integer" },
} };

test("beforeEffect is dispatcher-owned, expires with its invocation, and rechecks registration after awaited authority", async () => {
  const service = new ActionService(); let execution!: ActionExecutionContext, writes = 0;
  const register = () => service.registerProvider({ provider: { provider_id: "original", title: "Original", kind: "system", project_id: "a" }, definitions: [definition],
    handlers: [{ ...definition, handle: async context => { execution = context; await context.beforeEffect(); return ++writes; } }] });
  let dispose = register();
  try {
    assert.equal(await service.invoke({ ...caller, beforeEffect: async () => { throw new Error("Caller cannot supply the guard"); } } as ActionExecutionContext, definition, {}), 1);
    await assert.rejects(execution.beforeEffect(), errorCode("actions.expired"));
    const entered = gate(), release = gate(); let checks = 0;
    const pending = service.invoke({ ...caller, validate_authority: async () => { if (++checks === 2) { entered.resolve(); await release.promise; } } }, definition, {});
    const rejected = assert.rejects(pending, errorCode("actions.provider_changed"));
    await entered.promise; dispose(); dispose = register(); release.resolve(); await rejected;
    assert.equal(writes, 1);
    await assert.rejects(service.invoke({ ...caller, project_id: "b" }, definition, {}), errorCode("actions.scope_mismatch"));
  } finally { dispose(); }
});

test("typed Action handlers retain the Host Runtime and share the same live effect guard", async () => {
  const entered = gate(), release = gate(); let enabled = true;
  const host = new LocalHost({ runtimeFactory: { open: () => ({ writes: 0 }), close: () => {} }, actionAvailability: () =>
    enabled ? { available: true } : { available: false, code: "fixture.disabled", reason: "Disabled" } });
  const reference = { project_id: "a", board_id: "a", storage_key: "memory:effect" };
  host.register(definition, async (runtime, _, invocation) => { entered.resolve(); await release.promise; await invocation.beforeEffect(); return ++runtime.writes; });
  try {
    const pending = host.client(reference).invoke(definition, {}), rejected = assert.rejects(pending, errorCode("fixture.disabled"));
    await entered.promise; enabled = false; release.resolve(); await rejected;
    await host.withRuntime(reference, runtime => assert.equal(runtime.writes, 0));
    enabled = true;
    assert.equal(await host.actionClient(reference).invoke(caller, definition, {}), 1);
    await host.withRuntime(reference, runtime => assert.equal(runtime.writes, 1));
  } finally { release.resolve(); await host.close(); }
});

type Kind = "form" | "dataset" | "lingguang" | "pages" | "cognia";
const actions = { form: formActions.generateAi, dataset: datasetActions.generateAi, lingguang: lingguangActions.message, pages: pagesActions.generate, cognia: cogniaActions.synthesize };
const output = { form: "A generated question", dataset: "Generated column", lingguang: "A considered reply", pages: "A research draft with source boundaries.", cognia: "# Evidence\nA finding [S1]" };

async function prepare(kind: Kind, client: ReturnType<typeof bindActionClient>): Promise<Record<string, unknown>> {
  if (kind === "form") return { id: (await client.invoke(formActions.create, { title: "Original" })).form.id, prompt: "A question" };
  if (kind === "dataset") return { id: (await client.invoke(datasetActions.create, { title: "Original" })).dataset.id, prompt: "A column" };
  if (kind === "lingguang") {
    const { spark } = await client.invoke(lingguangActions.create, { title: "Original", body: "A thought" });
    const state = await client.invoke(lingguangActions.openConversation, { spark_ids: [spark.id] });
    return { id: state.conversation.id, body: "Explore this thought" };
  }
  if (kind === "cognia") return { material_ids: [(await client.invoke(cogniaActions.createMaterial, { title: "Original", body: "Evidence" })).material.id] };
  return { request_id: "request-1", request_hash: "hash-1", title: "Research", instructions: "Write a draft", inputs: [{ entry_id: "inbox-1", item_id: "material-1", revision: 1,
    title: "Source", body: "Original evidence", url: null, source_label: "Manual", captured_at: "2026-09-26T00:00:00Z", provenance: [] }] };
}

function persisted(home: string, kind: Kind, input: Record<string, unknown>) {
  if (kind === "form") { const store = openFormStore(home); try { return store.get(input.id as string, "a"); } finally { store.close(); } }
  if (kind === "dataset") { const store = openDatasetStore(home); try { return store.get(input.id as string, "a"); } finally { store.close(); } }
  if (kind === "lingguang") { const store = openLingguangStore(home); try { return store.conversation(input.id as string, "a"); } finally { store.close(); } }
  if (kind === "cognia") { const store = openCogniaStore(home); try { return { drafts: store.drafts(), materials: store.materials() }; } finally { store.close(); } }
  const store = openPagesStore(home); try { return { documents: store.list("a"), record: store.generation("a", input.request_id as string) }; } finally { store.close(); }
}

for (const kind of ["form", "dataset", "lingguang", "pages", "cognia"] as const) for (const mode of ["revoked", "disabled", "cancelled"] as const) {
  test(`${kind}: ${mode} during model wait prevents all later original SQLite writes and permits authorized recovery`, { timeout: 15_000 }, async t => {
    const home = await mkdtemp(join(tmpdir(), `${kind}-effect-`)), entered = gate(), release = gate(); let enabled = true, allowed = true;
    const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: async () => { entered.resolve(); await release.promise; return output[kind]; },
      actionAvailability: () => enabled ? { available: true } : { available: false, code: "actions.plugin_disabled", reason: "Disabled" } });
    const reference = molisWorkHostProjectReference({ databasePath: join(home, "project.sqlite"), boardId: "a", projectId: "a" });
    const client = kind === "cognia" ? host.homeActionClient() : host.actionClient(reference);
    const context: ActionCallContext = { ...caller, project_id: kind === "cognia" ? null : "a", validate_authority: () => {
      if (!allowed) throw new ActionError("actions.revoked", "Revoked");
    } };
    const bound = bindActionClient(client, () => context), controller = new AbortController();
    t.signal.addEventListener("abort", () => { controller.abort(); release.resolve(); }, { once: true });
    try {
      const input = await prepare(kind, bound);
      const pending = client.invoke({ ...context, signal: controller.signal }, actions[kind], input);
      const rejected = assert.rejects(pending, mode === "cancelled" ? kind === "cognia" ? errorCode("cognia.cancelled") : { name: "AbortError" } : errorCode(mode === "revoked" ? "actions.revoked" : "actions.plugin_disabled"));
      await waitForModel(entered.promise, pending);
      const before = persisted(home, kind, input);
      if (mode === "revoked") allowed = false;
      if (mode === "disabled") enabled = false;
      if (mode === "cancelled") controller.abort();
      release.resolve(); await rejected;
      assert.deepEqual(persisted(home, kind, input), before, "neither generated content nor failure bookkeeping may change after rejection");
      allowed = true; enabled = true;
      if (kind === "pages") {
        const store = openPagesStore(home);
        try { assert.equal(store.generation("a", "request-1")!.status, "running"); assert.equal(store.list("a").length, 0); } finally { store.close(); }
        await assert.rejects(client.invoke(context, actions[kind], input), /仍在生成/);
        // Age the original owner's lease to exercise its existing recovery path without a three-minute sleep.
        const db = openHomeSqliteDatabase(home, "pages");
        try { const old = new Date(Date.now() - 181_000).toISOString(); db.prepare("UPDATE page_generations SET updated_at = ?, record_json = json_set(record_json, '$.updated_at', ?) WHERE project_id = ? AND request_id = ?").run(old, old, "a", "request-1"); }
        finally { db.close(); }
      }
      const restored = await client.invoke(context, actions[kind], input);
      assert.notDeepEqual(persisted(home, kind, input), before);
      if (kind === "pages") {
        const store = openPagesStore(home);
        try { assert.equal(store.list("a").length, 1); assert.equal(store.generation("a", "request-1")!.status, "completed"); } finally { store.close(); }
        assert.equal((await client.invoke(context, actions[kind], input) as { replayed: boolean }).replayed, true);
      }
      assert.ok(restored);
    } finally { release.resolve(); await host.close(); await rm(home, { recursive: true, force: true }); }
  });
}

test("effect guard rechecks the actual Catalog installation after an asynchronous call, then permits reactivation", { timeout: 15_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "catalog-install-effect-")), catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "Installation lifecycle", actor_id: "owner" });
  catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: "goals", actor_id: "owner" });
  const entered = gate(), release = gate();
  const host = new LocalHost({ runtimeFactory: { open: () => ({ writes: 0 }), close: () => {} },
    actionAvailability: projectActionAvailability(async (_, run) => run(catalog), home) });
  const reference = molisWorkHostProjectReference({ databasePath: project.database_path, boardId: project.board_id, projectId: project.project_id });
  const action = { ...definition, action_provider: { provider_id: "io.molis.work.goals", plugin_id: "io.molis.work.goals", kind: "plugin" as const, title: "Goals", project_id: project.project_id } };
  host.register(action, async (runtime, _input, invocation) => { entered.resolve(); await release.promise; await invocation.beforeEffect(); return ++runtime.writes; });
  const context: ActionCallContext = { ...caller, project_id: project.project_id }, client = host.actionClient(reference);
  try {
    const pending = client.invoke(context, action, {}), rejected = assert.rejects(pending, errorCode("actions.plugin_disabled"));
    await entered.promise;
    catalog.removeProjectPlugin({ project_id: project.project_id, plugin_id: "goals", actor_id: "owner" });
    release.resolve(); await rejected;
    await host.withRuntime(reference, runtime => assert.equal(runtime.writes, 0));
    catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: "goals", actor_id: "owner" });
    assert.equal(await client.invoke(context, action, {}), 1);
  } finally { release.resolve(); await host.close(); catalog.close(); await rm(home, { recursive: true, force: true }); }
});
