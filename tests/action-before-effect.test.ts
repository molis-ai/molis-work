import { defineAction } from "@molis-ai/molis-work-plugin-sdk";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ActionError, bindActionClient, retainActionAuthority, type ActionCallContext, type ActionDefinition, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { formActions, FORM_ACTION_PERMISSIONS, createFormActionHandlers, ownFormStores } from "@molis-ai/molis-work-plugin-form";
import { openFormStore, openPagesStore } from "./fixtures/plugin-home-stores.js";
import { datasetActions, DATASET_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-dataset";
import { openDatasetStore } from "./fixtures/plugin-home-stores.js";
import { lingguangActions, LINGGUANG_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-lingguang";
import { openLingguangStore } from "./fixtures/plugin-home-stores.js";
import { pagesActions, PAGES_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-pages";
import { cogniaActions, COGNIA_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-cognia";
import { openCogniaStore } from "./fixtures/plugin-home-stores.js";
import { pptActions, PPT_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-ppt";
import { openPptStore } from "./fixtures/plugin-home-stores.js";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalHost, MolisWorkLocalHost, molisWorkHostProjectReference, projectActionAvailability } from "@molis-ai/molis-work-app-local-host";

const permissions = [...FORM_ACTION_PERMISSIONS, ...DATASET_ACTION_PERMISSIONS, ...LINGGUANG_ACTION_PERMISSIONS, ...PAGES_ACTION_PERMISSIONS, ...COGNIA_ACTION_PERMISSIONS, ...PPT_ACTION_PERMISSIONS];
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
    definitions: Object.values(formActions), handlers: createFormActionHandlers({ ...ownFormStores(run => run(store)), modelAvailability: () => ({ available: true }),
      completeText: async () => { models++; if (models === 1) { entered.resolve(); await release.promise; } return JSON.stringify({ status: "done", questions: [{ title: "Only the current registration may save", type: "text" }] }); } }) });
  let dispose = register();
  try {
    const pending = service.invoke(caller, formActions.draft, { id: original.id, prompt: "Question" });
    const rejected = assert.rejects(pending, errorCode("actions.provider_changed"));
    await entered.promise;
    dispose(); dispose = register(); release.resolve();
    await rejected;
    assert.deepEqual(store.get(original.id, "a"), original);
    const result = await service.invoke(caller, formActions.draft, { id: original.id, prompt: "Question" }) as { form: typeof original };
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
  const reference = { project_id: "a", storage_key: "memory:effect" };
  host.registerAction(definition, async (runtime, _, invocation) => { entered.resolve(); await release.promise; await invocation.beforeEffect(); return ++runtime.writes; });
  try {
    const pending = host.client(reference).invoke(definition, {}), rejected = assert.rejects(pending, errorCode("fixture.disabled"));
    await entered.promise; enabled = false; release.resolve(); await rejected;
    await host.withRuntime(reference, runtime => assert.equal(runtime.writes, 0));
    enabled = true;
    assert.equal(await host.actionClient(reference).invoke(caller, definition, {}), 1);
    await host.withRuntime(reference, runtime => assert.equal(runtime.writes, 1));
  } finally { release.resolve(); await host.close(); }
});

type Kind = "form" | "dataset" | "lingguang" | "pages" | "cognia" | "ppt";
const actions = { form: formActions.draft, dataset: datasetActions.generateAi, lingguang: lingguangActions.message, pages: pagesActions.generate, cognia: cogniaActions.synthesize, ppt: pptActions.outlineAi };
const output = { form: JSON.stringify({ status: "done", questions: [{ title: "A generated question", type: "text" }] }), dataset: "Generated column", lingguang: "A considered reply", pages: "A research draft with source boundaries.", cognia: "# Evidence\nA finding [S1]", ppt: "# Deck\n## A generated slide\n- A point" };

async function prepare(kind: Kind, client: ReturnType<typeof bindActionClient>): Promise<Record<string, unknown>> {
  if (kind === "form") return { id: (await client.invoke(formActions.create, { title: "Original" })).form.id, prompt: "A question" };
  if (kind === "dataset") return { id: (await client.invoke(datasetActions.create, { title: "Original" })).dataset.id, prompt: "A column" };
  if (kind === "lingguang") {
    const { spark } = await client.invoke(lingguangActions.create, { title: "Original", body: "A thought" });
    const state = await client.invoke(lingguangActions.openConversation, { spark_ids: [spark.id] });
    return { id: state.conversation.id, body: "Explore this thought" };
  }
  if (kind === "ppt") return { id: (await client.invoke(pptActions.create, { title: "Original" })).presentation.id, text: "Points to outline" };
  if (kind === "cognia") return { material_ids: [(await client.invoke(cogniaActions.createMaterial, { title: "Original", body: "Evidence" })).material.id] };
  return { request_id: "request-1", request_hash: "hash-1", title: "Research", instructions: "Write a draft", inputs: [{ entry_id: "inbox-1", item_id: "material-1", revision: 1,
    title: "Source", body: "Original evidence", url: null, source_label: "Manual", captured_at: "2026-09-26T00:00:00Z", provenance: [] }] };
}

function persisted(home: string, kind: Kind, input: Record<string, unknown>) {
  if (kind === "form") { const store = openFormStore(home); try { return store.get(input.id as string, "a"); } finally { store.close(); } }
  if (kind === "dataset") { const store = openDatasetStore(home); try { return store.get(input.id as string, "a"); } finally { store.close(); } }
  if (kind === "lingguang") { const store = openLingguangStore(home); try { return store.conversation(input.id as string, "a"); } finally { store.close(); } }
  if (kind === "ppt") { const store = openPptStore(home); try { return store.get(input.id as string, "a"); } finally { store.close(); } }
  if (kind === "cognia") { const store = openCogniaStore(home); try { return { drafts: store.drafts(), materials: store.materials() }; } finally { store.close(); } }
  const store = openPagesStore(home); try { return { documents: store.list("a"), record: store.generation("a", input.request_id as string) }; } finally { store.close(); }
}

for (const kind of ["form", "dataset", "lingguang", "pages", "cognia", "ppt"] as const) for (const mode of ["revoked", "disabled", "cancelled"] as const) {
  test(`${kind}: ${mode} during model wait prevents all later original SQLite writes and permits authorized recovery`, { timeout: 15_000 }, async t => {
    const home = await mkdtemp(join(tmpdir(), `${kind}-effect-`)), entered = gate(), release = gate(); let enabled = true, allowed = true, dispatched = 0;
    // The Host's model port: wait (the runtime being prepared), then the action's own pre-dispatch check, then send.
    const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: async (_prompt, options) => { entered.resolve(); await release.promise;
      await options?.beforeDispatch?.(); dispatched++; return output[kind]; },
      actionAvailability: () => enabled ? { available: true } : { available: false, code: "actions.plugin_disabled", reason: "Disabled" } });
    const reference = molisWorkHostProjectReference({ databasePath: join(home, "project.sqlite"), projectId: "a" });
    const client = kind === "cognia" ? host.homeActionClient() : host.actionClient(reference);
    const context: ActionCallContext = { ...caller, project_id: kind === "cognia" ? null : "a", validate_authority: () => {
      if (!allowed) throw new ActionError("actions.revoked", "Revoked");
    } };
    const bound = bindActionClient(client, () => context), controller = new AbortController();
    t.signal.addEventListener("abort", () => { controller.abort(); release.resolve(); }, { once: true });
    try {
      const input = await prepare(kind, bound);
      const pending = client.invoke({ ...context, signal: controller.signal }, actions[kind], input);
      // Cancelled before the model request is sent: the pre-dispatch check is what refuses, for every kind alike.
      const rejected = assert.rejects(pending, mode === "cancelled" ? { name: "AbortError" } : errorCode(mode === "revoked" ? "actions.revoked" : "actions.plugin_disabled"));
      await waitForModel(entered.promise, pending);
      const before = persisted(home, kind, input);
      if (mode === "revoked") allowed = false;
      if (mode === "disabled") enabled = false;
      if (mode === "cancelled") controller.abort();
      release.resolve(); await rejected;
      assert.equal(dispatched, 0, "the action's pre-dispatch check stops the model request itself, not only the write after it");
      assert.deepEqual(persisted(home, kind, input), before, "neither generated content nor failure bookkeeping may change after rejection");
      allowed = true; enabled = true;
      if (kind === "pages") {
        const store = openPagesStore(home);
        // The refused call wrote nothing; only this process knows its attempt ended, so a new call here takes it over
        // at once instead of waiting out the lease (other processes' attempts keep it: see pages-generation-lease).
        try { assert.equal(store.generation("a", "request-1")!.status, "running"); assert.equal(store.list("a").length, 0); } finally { store.close(); }
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
  // Schedule, not Goals: Goals is a 常开 plugin (ac-trust T3) that no project removes.
  catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: "schedule", actor_id: "owner" });
  const entered = gate(), release = gate();
  const host = new LocalHost({ runtimeFactory: { open: () => ({ writes: 0 }), close: () => {} },
    actionAvailability: projectActionAvailability(async (_, run) => run(catalog), home) });
  const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
  const action = { ...definition, action_provider: { provider_id: "io.molis.work.schedule", plugin_id: "io.molis.work.schedule", kind: "plugin" as const, title: "Schedule", project_id: project.project_id } };
  host.registerAction(action, async (runtime, _input, invocation) => { entered.resolve(); await release.promise; await invocation.beforeEffect(); return ++runtime.writes; });
  const context: ActionCallContext = { ...caller, project_id: project.project_id }, client = host.actionClient(reference);
  try {
    const pending = client.invoke(context, action, {}), rejected = assert.rejects(pending, errorCode("actions.plugin_disabled"));
    await entered.promise;
    catalog.removeProjectPlugin({ project_id: project.project_id, plugin_id: "schedule", actor_id: "owner" });
    release.resolve(); await rejected;
    await host.withRuntime(reference, runtime => assert.equal(runtime.writes, 0));
    catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: "schedule", actor_id: "owner" });
    assert.equal(await client.invoke(context, action, {}), 1);
  } finally { release.resolve(); await host.close(); catalog.close(); await rm(home, { recursive: true, force: true }); }
});


test("a typed Plugin SDK child keeps its originating invocation's effect guard", async () => {
  const service = new ActionService(), entered = gate(), release = gate();
  let writes = 0;
  const child = defineAction({ ...definition, capability_id: "fixture.sdk.child" }, async context => {
    entered.resolve(); await release.promise;
    await context.beforeEffect();
    return ++writes;
  });
  const disposeChild = service.registerProvider({ provider: { provider_id: "child", title: "Child", kind: "plugin", project_id: "a" }, definitions: [child.definition], handlers: [child.handler] });
  const register = () => service.registerProvider({ provider: { provider_id: "origin", title: "Origin", kind: "system", project_id: "a" }, definitions: [definition], handlers: [{ ...definition,
    handle: context => service.invoke(retainActionAuthority(context, { ...definition, provider_id: "origin" }, context.beforeEffect), child.definition, {}) }] });
  let dispose = register();
  try {
    const pending = service.invoke(caller, definition, {}), rejected = assert.rejects(pending, errorCode("actions.provider_changed"));
    await entered.promise; dispose(); dispose = register(); release.resolve(); await rejected;
    assert.equal(writes, 0, "a still-registered child cannot outlive the parent's registration");
    assert.equal(await service.invoke(caller, definition, {}), 1);
  } finally { release.resolve(); dispose(); disposeChild(); }
});
