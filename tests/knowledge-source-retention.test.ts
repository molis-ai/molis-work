import assert from "node:assert/strict";
import test from "node:test";
import { molisWorkHostProjectReference, type MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { openKnowledgeCards } from "@molis-ai/molis-work-storage";
import type { ActionCallContext, ActionExecutionContext, ActionReference, ActionSubjectContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AssistantSendResult, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import type { AgentRunRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import { knowledgeActions, type KnowledgeGrepResponse, type KnowledgeListResponse, type KnowledgeLocateResponse, type KnowledgeSearchResponse } from "@molis-ai/molis-work-contracts/services/knowledge";
import { knowledgeRef } from "@molis-ai/molis-work-service-knowledge";
import { codingProductHost } from "./fixtures/coding-product-host.js";
import { cogniaModelResponse } from "./fixtures/cognia-model-response.js";
import { isKnowledgeOrganize, organizedCardFor } from "./fixtures/knowledge-organize.js";
import { untilSetup } from "./fixtures/connector-assistant-model.js";

// A4-K: original red evidence is /private/tmp/memory-v0-a4-knowledge-probe-20261104/results.json.
// This is the product HTTP/Action/Source/Search/Knowledge chain, a real SDK and SQLite, with a controlled provider only.
test("A4-K Coding archive retains both cards, gates subject/ref/read/outline/grep/locate, and keeps owner history", { timeout: 90_000 }, async t => {
  const f = await codingProductHost(t, () => cogniaModelResponse("A4_K_SOURCE 星空归档原件。"));
  const host: MolisWorkLocalHost = f.host;
  const originalFetch = globalThis.fetch, written: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.startsWith("http://127.0.0.1:")) {
      const raw = input instanceof Request ? await input.clone().text() : await new Request(input, init).text();
      if (isKnowledgeOrganize(raw)) written.push((JSON.parse(organizedCardFor(raw)) as { title: string }).title);
    }
    return originalFetch(input, init);
  });
  const project = f.project.project_id, prefix = `/projects/${project}`, coding = "/api/plugins/io.molis.work.coding";
  const ref = molisWorkHostProjectReference({ projectId: project, databasePath: f.project.database_path });
  const client = host.actionClient(ref), person = await host.localPersonContext(ref);
  const agent: ActionCallContext = { ...person, audience: "agent" };
  const boot = await f.call(project, coding + "/state");
  assert.equal(boot.status, 200, JSON.stringify(boot.body));
  const directory = await client.discover(person);
  const action = (id: string): ActionReference => {
    const view = directory.find(view => view.capability_id === id && view.availability.available);
    assert.ok(view, id); return { capability_id: id, version: view.version, provider_id: view.provider.provider_id };
  };
  const reader = action("coding.subject.read"), state = action("coding.subject.state"), update = action("coding.sessions.update");
  const cards = openKnowledgeCards({ homeDirectory: f.home }); t.after(() => cards.close());
  const subjects: Array<{ kind: string; id: string }> = [];
  const run = async (id: string, task: string) => {
    const sent = await f.call<{ run: { ref: AgentRunRef } }>(project, `${coding}/sessions/${id}/runs`, {
      task, intent: "discuss", workspace_id: f.workspaceId, provider_id: "fixture", model_id: "fixture-model" });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    assert.equal((await f.ended(sent.body.run.ref)).phase, "completed");
    assert.equal((await f.call(project, coding + "/state")).status, 200);
  };
  for (const title of ["K未编辑", "K已编辑"]) {
    const created = await f.call<{ session: { session_id: string } }>(project, coding + "/sessions", { title });
    assert.equal(created.status, 200); const id = created.body.session.session_id;
    subjects.push({ kind: "coding_session", id }); await run(id, "只回复 A4_K_SOURCE 星空归档原件。");
  }
  const stable = async () => untilSetup(async () => {
    await client.invoke(agent, knowledgeActions.list, {});
    const contexts = await Promise.all(subjects.map(subject => client.invoke(person, reader, { subject_id: subject.id }) as Promise<ActionSubjectContext>));
    return subjects.every((subject, i) => {
      const card = cards.get(project, subject);
      return card?.state === "ready" && card.revision === contexts[i]!.revision && card.organized_revision === card.revision;
    }) ? true : undefined;
  }, "ready cards match the actual bounded source material", 20_000);
  await stable();
  await f.web.post(prefix + "/api/knowledge/edit", { subject: subjects[1], title: "本人编辑保留" });
  const before = subjects.map(subject => cards.get(project, subject)!);
  assert.ok(before.every(card => card.revision.startsWith("content-v1:")));
  assert.deepEqual(before.map(card => card.edited), [[], ["title"]]);
  const calls = written.length;
  for (const subject of subjects) await client.invoke(person, update, { session_id: subject.id, archive: true });
  await untilSetup(async () => {
    await client.invoke(agent, knowledgeActions.list, {});
    return subjects.every(subject => cards.get(project, subject)?.state === "missing") ? true : undefined;
  }, "both archived cards are retained missing", 20_000);
  assert.equal(written.length, calls, "archive does not call the organizer model");
  for (const [i, subject] of subjects.entries()) {
    const after = cards.get(project, subject)!;
    assert.deepEqual({ ...after, state: before[i]!.state }, before[i], "all card content, edits and organized material survive archive");
    assert.deepEqual(await client.invoke(person, state, { subject_id: subject.id }), { subject, state: "archived" });
    for (const name of [subject, knowledgeRef(subject)]) {
      await assert.rejects(client.invoke(agent, knowledgeActions.read, { subject: name }), { code: "knowledge.unreadable" });
      await assert.rejects(client.invoke(agent, knowledgeActions.outline, { subject: name }), { code: "knowledge.unreadable" });
    }
    await assert.rejects(client.invoke(person, reader, { subject_id: subject.id }), { code: "coding.subject_archived" });
    const detail = await f.call<{ runs: unknown[] }>(project, `${coding}/sessions/${subject.id}`);
    assert.equal(detail.status, 200); assert.ok(detail.body.runs.length > 0, "the owner's original detail still holds the completed history");
  }
  const listed = await client.invoke(agent, knowledgeActions.list, {}) as KnowledgeListResponse;
  assert.equal(listed.pieces.filter(piece => piece.subject.kind === "coding_session").length, 0);
  const searched = await client.invoke(agent, knowledgeActions.search, { query: "星空归档原件" }) as KnowledgeSearchResponse;
  assert.equal(searched.cards.length, 0);
  const grepped = await client.invoke(agent, knowledgeActions.grep, { pattern: "A4_K_SOURCE", subjects: subjects.map(subject => knowledgeRef(subject)) }) as KnowledgeGrepResponse;
  assert.deepEqual([grepped.matches, grepped.found, grepped.unread.length], [[], [], 2]);
  const located = await client.invoke(agent, knowledgeActions.locate, { question: "原件讲了什么？", subjects: subjects.map(subject => knowledgeRef(subject)) }) as KnowledgeLocateResponse;
  assert.deepEqual([located.sections, located.unread.length], [[], 2]);
  // Missing state cannot be interpreted as deleted. A still-current but unprivileged caller receives no original.
  await assert.rejects(client.invoke({ ...agent, permissions: [] }, knowledgeActions.read, { subject: subjects[0] }));
  assert.ok(subjects.every(subject => cards.get(project, subject)?.state === "missing"));
  // Simulate the actual stale-card window without changing owner data; the real Assistant opening still checks each source.
  for (const card of before) cards.put(card);
  const requestOffset = f.requests.length;
  const sent = await f.web.post<AssistantSendResult>(prefix + "/api/assistant/send", { text: "说明本项目现在能用的资料", request_id: crypto.randomUUID() });
  await untilSetup(async () => { const view = await f.web.get<AssistantWorkView>(`${prefix}/api/assistant/works/${sent.work.work_id}`); return view.work.state === "completed" ? true : undefined; }, "the actual Assistant opening completes", 20_000);
  const catalogs = f.requests.slice(requestOffset).flatMap(request => request.messages.flatMap(message => {
    if (typeof message.content !== "string" || !message.content.startsWith("Untrusted context data.")) return [];
    const data = JSON.parse(message.content.slice(message.content.indexOf("{"))) as { text?: string };
    const split = data.text?.indexOf("\n\n") ?? -1;
    return split >= 0 && (JSON.parse(data.text!.slice(0, split)) as { title?: string }).title === "项目资料目录" ? [data.text!.slice(split + 2)] : [];
  }));
  assert.deepEqual(catalogs, [], "the actual Assistant project-knowledge material excludes archived titles and briefs");
  await client.invoke(agent, knowledgeActions.list, {});
  assert.equal(written.length, calls, "the stale snapshot does not restart organizing archived sources");
  t.diagnostic("A4-K archive evidence " + JSON.stringify({ writerCalls: written.length, cardStates: subjects.map(subject => cards.get(project, subject)?.state), actualOwnerAgentAudience: true }));
});

// These owners are registered through the real Host ActionService. No mocked dispatcher or private Knowledge implementation.
test("A4-K unavailable/missing state retains adopted cards; withdrawn current provider registration cannot revive its waiting query", { timeout: 60_000 }, async t => {
  const { SUBJECT_REFERENCE_TYPE, SUBJECT_STATE_TYPE, SUBJECT_STATE_INPUT_SCHEMA, SUBJECT_STATE_OUTPUT_SCHEMA, defineSearchEntriesAction, defineSubjectContextAction, bindSearchEntriesHandler, subjectContext } = await import("@molis-ai/molis-work-contracts/platform/actions");
  const { searchActions } = await import("@molis-ai/molis-work-contracts/services/search");
  const f = await codingProductHost(t, () => cogniaModelResponse("not used"));
  const host: MolisWorkLocalHost = f.host;
  const project = f.project.project_id, reference = molisWorkHostProjectReference({ projectId: project, databasePath: f.project.database_path });
  assert.equal((await f.call(project, "/api/plugins/io.molis.work.coding/state")).status, 200);
  const client = host.actionClient(reference);
  let person = await host.localPersonContext(reference), agent: ActionCallContext = { ...person, audience: "agent" };
  const freshCaller = async () => { person = await host.localPersonContext(reference); agent = { ...person, audience: "agent" }; };
  const source = defineSearchEntriesAction("a4.entries", [{ kind: "a4_document", title: "资料", surface: "a4" }], "资料", ["artifact:read"]);
  const reader = defineSubjectContextAction("a4.read", "a4_document", "资料", ["artifact:read"]);
  const state = { ...reader, capability_id: "a4.state", version: 1, action: { ...reader.action, input_type: SUBJECT_REFERENCE_TYPE, output_type: SUBJECT_STATE_TYPE, input_schema: SUBJECT_STATE_INPUT_SCHEMA, output_schema: SUBJECT_STATE_OUTPUT_SCHEMA } };
  const subject = { kind: "a4_document", id: "one" };
  let listed = true, available = true, hold = false;
  const lifecycleEvidence: Array<{ event: string; call_id?: string; audience?: string; audit?: string; available?: boolean; aborted?: boolean }> = [];
  const started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const { definePlugin } = await import("@molis-ai/molis-work-plugin-sdk");
  const { PluginRuntime, SqlitePluginRuntimeRepository } = await import("@molis-ai/molis-work-plugin-runtime");
  let version = 0;
  const definition = (withState: boolean) => definePlugin({ manifest: { schema_version: 1, host_api_version: 1, plugin_id: "io.molis.work.example.a4-source", version: `1.0.${version++}`, name: "A4 owner",
    kind: "app", publisher: { publisher_id: "example", signature: "a4-source" }, ...(version > 1 ? { upgrade_compatibility: { compatible_from_versions: Array.from({ length: version - 1 }, (_, index) => `1.0.${index}`) } } : {}), entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: [{ permission: "artifact:read", required: false, reason: "读取资料" }], actions: [source, reader, ...(withState ? [state] : [])],
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] } },
    async start() { return { kind: "app", actions: [bindSearchEntriesHandler(source, () => listed ? [{ subject, title: "原始资料", revision: "1", summary: "", updated_at: null, content: "context", open: { surface: "a4", id: "one" } }] : []),
      { ...reader, handle: () => subjectContext({ subject, revision: "1", title: "原始资料", content: "ONLY_CURRENT_OWNER_BODY" }) },
      ...(withState ? [{ ...state, availability: () => available ? { available: true as const } : { available: false as const, code: "actions.forbidden", reason: "state grant withdrawn" }, handle: async (caller: ActionExecutionContext) => {
        if (hold && caller.audit_actor_id === "a4-held-read") {
          hold = false; lifecycleEvidence.push({ event: "held", call_id: caller.call_id, audience: caller.audience, audit: caller.audit_actor_id });
          started.resolve(); await release.promise;
          lifecycleEvidence.push({ event: "released", call_id: caller.call_id, aborted: caller.signal?.aborted });
        }
        return { subject, state: "active" };
      } }] : []),
    ] }; },
  });
  const repository = await host.withProject(reference, projectRuntime => new SqlitePluginRuntimeRepository(projectRuntime.store.db));
  const runtime = new PluginRuntime(repository, undefined, { hostIds: new Set(), actions: { registry: host.actionRegistry(reference), project_id: project } });
  const install = runtime.install({ definition: definition(true), deployment: "local", trust: { level: "unsigned" }, grants: ["artifact:read"] }).install.install_id;
  await runtime.start(install); await freshCaller();
  try {
  const cards = openKnowledgeCards({ homeDirectory: f.home }); t.after(() => cards.close());
  await untilSetup(async () => { await client.invoke(agent, knowledgeActions.list, {}); return cards.get(project, subject)?.state === "ready" ? true : undefined; }, "adopted current-owner card", 20_000).catch(async error => {
    t.diagnostic("A4_STATE_DIAGNOSTIC " + JSON.stringify({ cards: cards.list(project), views: (await client.discover(person)).filter(view => view.capability_id.startsWith("a4.")) })); throw error;
  });
  const original = cards.get(project, subject)!; assert.ok(original.revision.startsWith("content-v1:"));
  listed = false; available = false;
  await client.invoke(person, searchActions.rebuild, { scope: "project" }); await client.invoke(agent, knowledgeActions.list, {});
  assert.deepEqual({ ...cards.get(project, subject), state: original.state }, original);
  await assert.rejects(client.invoke(agent, knowledgeActions.read, { subject }), { code: "knowledge.unreadable" });
  await runtime.upgrade({ install_id: install, definition: definition(false) }); await freshCaller();
  await client.invoke(person, searchActions.rebuild, { scope: "project" }); await client.invoke(agent, knowledgeActions.list, {});
  assert.equal(cards.get(project, subject)?.state, "missing", "adopted token + removed state action is unknown, not deleted or a legacy source");
  await runtime.stop(install); await freshCaller();
  const opaque = { ...original, revision: "opaque", organized_revision: "opaque", state: "missing" as const };
  cards.put(opaque); await client.invoke(person, searchActions.rebuild, { scope: "project" }); await client.invoke(agent, knowledgeActions.list, {});
  assert.deepEqual(cards.get(project, subject), opaque, "a missing provider preserves even an old opaque card");
  await runtime.start(install); await freshCaller(); await client.invoke(person, searchActions.rebuild, { scope: "project" }); await client.invoke(agent, knowledgeActions.list, {});
  assert.equal(cards.get(project, subject), null, "only a current available no-state unadopted source keeps the previous absent-card behavior");
  listed = true; available = true; await runtime.upgrade({ install_id: install, definition: definition(true) }); await freshCaller();
  await client.invoke(person, searchActions.rebuild, { scope: "project" });
  await untilSetup(async () => { await client.invoke(agent, knowledgeActions.list, {}); return cards.get(project, subject)?.state === "ready" ? true : undefined; }, "the same provider has a newly current card", 20_000);
  const receipts = cards.receipts(project, { limit: 10, offset: 0 }).total;
  hold = true; const oldRead = client.invoke({ ...agent, audit_actor_id: "a4-held-read" }, knowledgeActions.read, { subject }).then(result => {
    t.diagnostic("A4_WITHDRAWN_READ_RESULT " + JSON.stringify(result)); return result;
  });
  const refused = assert.rejects(oldRead, { code: "knowledge.unreadable" });
  await started.promise;
  const stopping = runtime.stop(install);
  const withdrawn = (await client.discover(person)).filter(view => view.capability_id === state.capability_id && view.availability.available);
  lifecycleEvidence.push({ event: "registry-after-stop-before-release", available: withdrawn.length > 0 });
  assert.equal(withdrawn.length, 0, "the actual state registration is withdrawn before releasing the old query");
  release.resolve(); await stopping;
  await runtime.start(install); await freshCaller();
  t.diagnostic("A4_STATE_LIFECYCLE_EVIDENCE " + JSON.stringify(lifecycleEvidence));
  await refused;
  assert.equal(cards.receipts(project, { limit: 10, offset: 0 }).total, receipts, "the withdrawn call writes no read receipt");
  const current = await client.invoke(agent, knowledgeActions.read, { subject }).catch(async error => { t.diagnostic("A4_REACTIVATED_DIAGNOSTIC " + JSON.stringify({ card: cards.get(project, subject), views: (await client.discover(person)).filter(view => view.capability_id.startsWith("a4.")) })); throw error; }) as { text: string };
  assert.equal(current.text, "ONLY_CURRENT_OWNER_BODY", "the new current invocation is independently authorized");
  const automatic = await host.search!.knowledgeCatalog(project, await client.discover(person), "", { caller: person, client });
  assert.ok(!automatic.catalog.pieces.some(piece => piece.subject.kind === subject.kind && piece.subject.id === subject.id), "a provider declaring state without a reliable Host current capture is withheld from automatic catalogs");
  assert.equal(automatic.catalog.whole, false); automatic.control?.dispose();
  } finally { release.resolve(); await runtime.stop(install); }
});

test("A4-K a current legacy reader without a search source keeps the raw-subject reading contract", { timeout: 30_000 }, async t => {
  const { openTestHome } = await import("./fixtures/test-home.js");
  const { definePlugin } = await import("@molis-ai/molis-work-plugin-sdk");
  const { PluginRuntime, SqlitePluginRuntimeRepository } = await import("@molis-ai/molis-work-plugin-runtime");
  const { defineSubjectContextAction, subjectContext } = await import("@molis-ai/molis-work-contracts/platform/actions");
  const home = await openTestHome(t, { catalogPolicy: false }), project = await home.createProject("reader only");
  const host: MolisWorkLocalHost = home.host;
  const reader = defineSubjectContextAction("legacy.body", "legacy_document", "原资料", ["artifact:read"]), subject = { kind: "legacy_document", id: "direct" };
  const plugin = definePlugin({ manifest: { schema_version: 1, host_api_version: 1, plugin_id: "io.molis.work.example.reader-only", version: "1.0.0", name: "reader only",
    kind: "app", publisher: { publisher_id: "example", signature: "reader-only" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: [{ permission: "artifact:read", required: false, reason: "读取" }], actions: [reader], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] } },
    async start() { return { kind: "app", actions: [{ ...reader, handle: () => subjectContext({ subject, revision: "1", title: "仅供引用", content: "legacy-body" }) }] }; } });
  const repository = await host.withProject(project.reference, runtime => new SqlitePluginRuntimeRepository(runtime.store.db));
  const runtime = new PluginRuntime(repository, undefined, { hostIds: new Set(), actions: { registry: host.actionRegistry(project.reference), project_id: project.project_id } });
  const id = runtime.install({ definition: plugin, trust: { level: "unsigned" }, deployment: "local", grants: ["artifact:read"] }).install.install_id;
  try {
    await runtime.start(id);
    const person = await host.localPersonContext(project.reference);
    const result = await host.actionClient(project.reference).invoke({ ...person, audience: "agent" }, knowledgeActions.read, { subject }) as { text: string };
    assert.equal(result.text, "legacy-body");
  } finally { await runtime.stop(id); }
});
