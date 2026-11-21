import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { OBSERVATION_LIMITS, observationActions } from "@molis-ai/molis-work-contracts/services/observation";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { createHostObservation, installHostUiText, observationShellDoor, webEntryDoor, type HostObservation, type HostObservationPorts } from "@molis-ai/molis-work-app-local-host";
import { readRecords, RETENTION_KEY, retentionActions, withObservationSource } from "@molis-ai/molis-work-service-observation";
import { openTestHome } from "./fixtures/test-home.js";

installHostUiText();

// S-observation-records (docs/system/security-invariants/S-observation-records.md; specs/observation-collection/contract-design.md §4, §7):
// the work records are written from the trusted caller only. The shell reports only through its own route's entry credential; a plugin only
// under its own plugin_id, from the Host-issued caller; Agents, MCP clients and workflows do not report at all. A call refused before its
// handler, or failing once it began, leaves no input or result in the records (S-12, S-18).

const refused = (code: string) => (error: unknown) => error instanceof ActionError && error.code === code;
const person = (extra: Partial<ActionCallContext> = {}): ActionCallContext => ({ actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user", audience: "user", project_id: null, permissions: [], ...extra });
const plugin = (plugin_id: string, extra: Partial<ActionCallContext> = {}): ActionCallContext => person({ actor_id: `plugin:${plugin_id}`, actor_kind: "runtime", audience: "plugin",
  host_plugin: { plugin_id, install_id: `${plugin_id}-install`, actor_id: `plugin:${plugin_id}`, project_id: null, declaration: { manifest: {} as never }, assertActive: () => {} }, ...extra });
const facts = (...names: string[]) => ({ facts: names.map(fact => ({ fact, outcome: "succeeded" as const })) });

function home(t: test.TestContext, ports?: HostObservationPorts) {
  const directory = mkdtempSync(join(tmpdir(), "observation-records-"));
  let observation: HostObservation | undefined;
  const service = new ActionService(undefined, { observed: (caller, action, value) => observation?.observed(caller, action, value) });
  observation = createHostObservation(directory, ports);
  service.registerProvider(observation.provider);
  t.after(() => { observation?.close(); rmSync(directory, { recursive: true, force: true }); });
  const records = () => { observation!.layer.flush(); return readRecords(observation!.layer.writer.database()!.db); };
  return { directory, service, observation, records, host: { homeActionClient: () => service, actionClient: () => service } };
}

test("S-observation-records 1: only the person and plugins see the report action; Agents, MCP clients and workflows neither see nor call it", async t => {
  const { service } = home(t);
  assert.deepEqual(observationActions.report.action.audiences, ["user", "plugin"]);
  for (const audience of ["agent", "mcp", "workflow"] as const) {
    const caller = person({ audience, actor_kind: "runtime", actor_id: "runtime-1" });
    assert.deepEqual((await service.discover(caller)).filter(view => view.capability_id === "observation.report"), [], `${audience} does not see it`);
    await assert.rejects(service.invoke(caller, observationActions.report, facts("agent.x")), (error: unknown) => error instanceof ActionError, `${audience} cannot call it`);
  }
});

test("S-observation-records 2: a person's report without the shell route's credential is refused, whoever issued what they carry", async t => {
  const { service, host, records } = home(t);
  const text = { source: "web", conversation_ref: "web:observation:ui", message_ref: "web:forged" } as const;
  for (const [label, extra] of [["no credential", {}], ["hand-written", { user_action: text }], ["frozen copy", { user_action: Object.freeze({ ...text }) }],
    ["on someone's behalf", { delegated_by: "io.molis.work.example", user_action: text }]] as const) {
    await assert.rejects(service.invoke(person(extra), observationActions.report, facts("ui.stage")), refused("actions.forbidden"), label);
  }
  const request = { headers: { "x-molis-work-idempotency-key": "request-1" } };
  // Another page's door issues a real credential for its own request; it is still not the shell's.
  const pluginPage = webEntryDoor<null>("plugin-page:notes", () => "notes page only");
  await assert.rejects(pluginPage.invoke({ host, request, entry: null }, observationActions.report, facts("ui.stage")),
    refused("actions.forbidden"), "another page's credential");
  assert.deepEqual(await observationShellDoor.invoke({ host, request, entry: null }, observationActions.report, facts("ui.stage", "notes.made_up")),
    { accepted: 1, rejected: [{ index: 1, code: "observation.fact_not_owned" }] }, "the shell's own route, and only ui.*");
  assert.deepEqual(records().filter(record => record.fact !== "action.call").map(record => [record.owner, record.fact]), [[{ kind: "shell" }, "ui.stage"]]);
});

test("S-observation-records 3: a plugin reports only under its own plugin_id, named by the Host-issued caller and never by its input", async t => {
  const { service, records } = home(t);
  assert.deepEqual(await service.invoke(plugin("notes"), observationActions.report, facts("notes.saved", "todo.saved", "ui.stage")),
    { accepted: 1, rejected: [{ index: 1, code: "observation.fact_not_owned" }, { index: 2, code: "observation.fact_not_owned" }] });
  await assert.rejects(service.invoke(person({ audience: "plugin", actor_kind: "runtime", actor_id: "plugin:notes" }), observationActions.report, facts("notes.saved")),
    refused("observation.reporter_unknown"), "a plugin audience without the Host-issued caller");
  const own = records().filter(record => record.fact !== "action.call");
  assert.deepEqual(own.map(record => [record.owner, record.fact, record.install_id]), [[{ kind: "plugin", id: "notes" }, "notes.saved", "notes-install"]]);
});

test("S-observation-records 4: a call refused before its handler, or failing once it began, keeps no input or result", async t => {
  const { service, records } = home(t);
  const schema = { type: "object", properties: { secret: { type: "string" } }, additionalProperties: false } as const;
  const definition = (capability_id: string) => ({ capability_id, version: 1, operation: "command" as const, action: { title: capability_id, description: capability_id,
    kind: "operation" as const, scope: "home" as const, effect: "write" as const, audiences: ["agent" as const], permissions: [], subject_kinds: [], input_schema: schema, output_schema: { type: "object" } } });
  const failing = definition("test.fails"), personOnly = { ...definition("test.person_only"), action: { ...definition("test.person_only").action, audiences: ["user" as const] } };
  service.registerProvider({ provider: { provider_id: "system.test", title: "Test", kind: "system" }, definitions: [failing, personOnly], handlers: [
    { capability_id: "test.fails", version: 1, handle: () => { throw new ActionError("actions.forbidden", "revoked mid-way"); } },
    { capability_id: "test.person_only", version: 1, handle: () => ({}) },
  ] });
  const agent = person({ audience: "agent", actor_kind: "runtime", actor_id: "agent-1" });
  await assert.rejects(service.invoke(agent, personOnly, { secret: "the-first-secret" }));
  await assert.rejects(service.invoke(agent, failing, { secret: "the-second-secret" }));
  const calls = records().filter(record => record.fact === "action.call");
  assert.deepEqual(calls.map(record => record.outcome), ["refused", "failed"]);
  assert.ok(calls.every(record => record.evidence.every(item => item.ref.kind === "missing" && item.ref.reason === "by_rule")));
  assert.ok(!JSON.stringify(calls).includes("the-first-secret") && !JSON.stringify(calls).includes("the-second-secret"));
});

test("S-observation-records 6: an action that declares its input an unsent draft is recorded as saved, never with the draft's words", async t => {
  const { service, records } = home(t);
  const schema = { type: "object", properties: { draft: { type: "string" } }, additionalProperties: false } as const;
  const draft = { capability_id: "test.save_draft", version: 1, operation: "command" as const, action: { title: "save draft", description: "save draft",
    kind: "operation" as const, scope: "home" as const, effect: "write" as const, draft: true as const, audiences: ["user" as const], permissions: [], subject_kinds: [],
    input_schema: schema, output_schema: { type: "object" } } };
  service.registerProvider({ provider: { provider_id: "system.test", title: "Test", kind: "system" }, definitions: [draft], handlers: [
    { capability_id: "test.save_draft", version: 1, handle: (_caller, input) => ({ saved: (input as { draft: string }).draft }) },
  ] });
  assert.deepEqual(await service.invoke(person(), draft, { draft: "the-unsent-words" }), { saved: "the-unsent-words" });
  const [call] = records().filter(record => record.fact === "action.call");
  assert.equal(call?.outcome, "succeeded", "that the draft was saved, by whom and when, is kept");
  assert.deepEqual(call!.evidence.map(item => [item.role, item.ref.kind, item.ref.kind === "missing" ? item.ref.reason : null]),
    [["input", "missing", "by_rule"], ["result", "missing", "by_rule"]]);
  assert.ok(!JSON.stringify(call).includes("the-unsent-words"));
});

// Review B2 on #2059: `draft` is the provider's own word, so it never lets a provider leave an Agent's, an MCP client's, a workflow's or a
// plugin's write unrecorded; only the person's own call to save a draft is kept without its words.
test("S-observation-records 7: the draft rule is refused to every caller but the person: another audience's write through a draft action keeps its content", async t => {
  const { service, records } = home(t);
  const schema = { type: "object", properties: { draft: { type: "string" } }, additionalProperties: false } as const;
  const draft = { capability_id: "test.save_draft", version: 1, operation: "command" as const, action: { title: "save draft", description: "save draft",
    kind: "operation" as const, scope: "home" as const, effect: "write" as const, draft: true as const, audiences: ["user" as const, "agent" as const, "plugin" as const], permissions: [], subject_kinds: [],
    input_schema: schema, output_schema: { type: "object" } } };
  service.registerProvider({ provider: { provider_id: "system.test", title: "Test", kind: "system" }, definitions: [draft], handlers: [
    { capability_id: "test.save_draft", version: 1, handle: (_caller, input) => ({ saved: (input as { draft: string }).draft }) },
  ] });
  await service.invoke(person({ actor_id: "agent:round-1", actor_kind: "runtime", audience: "agent" }), draft, { draft: "the-agent-wrote-this" });
  await service.invoke(plugin("io.example.notes"), draft, { draft: "the-plugin-wrote-this" });
  await service.invoke(person(), draft, { draft: "the-person-unsent" });
  const calls = records().filter(record => record.fact === "action.call");
  assert.equal(calls.length, 3);
  // Content is kept as encrypted snapshots, so each call is told apart by who made it.
  const by = (actor: string) => calls.find(record => record.actor.actor_id === actor)!.evidence.map(item => [item.role, item.ref.kind, item.ref.kind === "missing" ? item.ref.reason : null]);
  for (const actor of ["agent:round-1", "plugin:io.example.notes"]) assert.deepEqual(by(actor), [["input", "snapshot", null], ["result", "snapshot", null]], `${actor}: its write keeps its content`);
  assert.deepEqual(by(LOCAL_PERSON_ACTOR_ID), [["input", "missing", "by_rule"], ["result", "missing", "by_rule"]], "the person's own unsent draft still keeps no words");
});

test("S-observation-records 5: a reporter past its day's quota is turned down whole, while other reporters keep their own", async t => {
  const { directory, service, observation } = home(t);
  assert.deepEqual(await service.invoke(plugin("notes"), observationActions.report, facts("notes.saved")), { accepted: 1, rejected: [] });
  observation.layer.flush();
  // The day's count as the next start finds it: this installation is at the limit.
  observation.layer.writer.database()!.db.prepare("UPDATE report_quota SET facts = ? WHERE reporter = ? AND day = ?")
    .run(OBSERVATION_LIMITS.facts_per_reporter_day, "install:notes-install", new Date().toISOString().slice(0, 10));
  observation.close();
  const reopened = createHostObservation(directory), next = new ActionService(undefined, {});
  t.after(() => reopened.close());
  next.registerProvider(reopened.provider);
  await assert.rejects(next.invoke(plugin("notes"), observationActions.report, facts("notes.second")), refused("observation.report_quota_exceeded"));
  assert.deepEqual(await next.invoke(plugin("todo"), observationActions.report, facts("todo.saved")), { accepted: 1, rejected: [] }, "another installation's quota is its own");
  reopened.layer.flush();
  const kept = readRecords(reopened.layer.writer.database()!.db).map(record => record.fact);
  assert.ok(!kept.includes("notes.second") && kept.includes("todo.saved"));
});

test("S-observation-records 8: cross-project and Home-context reads are refused outside the caller's reach", async t => {
  const { service, observation } = home(t, {
    catalogProjects: async () => ["proj-a", "proj-b", "proj-closing"],
    openProjects: () => [
      { project_id: "proj-a", state: "ready" } as never,
      { project_id: "proj-b", state: "ready" } as never,
      { project_id: "proj-closing", state: "closing" } as never,
    ],
  });
  const seed = {
    capability_id: "test.note", version: 1, operation: "command" as const,
    action: {
      title: "note", description: "note", kind: "operation" as const, scope: "home" as const, effect: "write" as const,
      audiences: ["user" as const, "agent" as const], permissions: [], subject_kinds: [],
      input_schema: { type: "object", properties: { body: { type: "string" } }, additionalProperties: false },
      output_schema: { type: "object" },
    },
  };
  service.registerProvider({
    provider: { provider_id: "system.seed", title: "Seed", kind: "system" },
    definitions: [seed],
    handlers: [{ capability_id: "test.note", version: 1, handle: (_caller, input) => ({ saved: (input as { body: string }).body }) }],
  });
  await service.invoke(person({ project_id: "proj-a" }), seed, { body: "note-a" });
  await service.invoke(person({ project_id: "proj-b" }), seed, { body: "note-b" });
  await service.invoke(person({ project_id: "proj-closing" }), seed, { body: "note-closing" });
  await service.invoke(person({ project_id: null }), seed, { body: "note-home" });
  observation.layer.flush();
  const all = readRecords(observation.layer.writer.database()!.db, { fact: "action.call" });
  const idFor = (projectId: string | null) => all.find(record => record.project_id === projectId && record.detail.action === "test.note@1")!.record_id;
  const recA = idFor("proj-a"), recB = idFor("proj-b"), recHome = idFor(null);

  for (const audience of ["agent", "mcp", "workflow", "plugin"] as const) {
    const homeCaller = audience === "plugin" ? plugin("notes", { project_id: null }) : person({ audience, actor_kind: "runtime", actor_id: `${audience}-1`, project_id: null });
    await assert.rejects(service.invoke(homeCaller, observationActions.recordsQuery, { use: "assistant" }), refused("observation.forbidden"), `${audience} Home query`);
    await assert.rejects(service.invoke(homeCaller, observationActions.evidenceGet, { use: "assistant", record_id: recHome }), refused("observation.forbidden"), `${audience} Home evidence`);
    await assert.rejects(service.invoke(homeCaller, observationActions.coverageGet, { use: "assistant" }), refused("observation.forbidden"), `${audience} Home coverage`);
  }

  const agentInA = person({ audience: "agent", actor_kind: "runtime", actor_id: "agent-a", project_id: "proj-a" });
  const inA = await service.invoke(agentInA, observationActions.recordsQuery, { use: "assistant" });
  assert.ok(inA.records.some(record => record.record_id === recA) && inA.records.every(record => record.project_id === "proj-a"));
  await assert.rejects(service.invoke(agentInA, observationActions.recordsQuery, { use: "assistant", all_projects: true }), refused("observation.forbidden"), "agent all_projects");
  await assert.rejects(service.invoke(agentInA, observationActions.recordsQuery, { use: "assistant", project_id: "proj-b" }), refused("observation.forbidden"), "agent cross project_id");
  await assert.rejects(service.invoke(agentInA, observationActions.evidenceGet, { use: "assistant", record_id: recB }), refused("observation.forbidden"), "agent cross evidence");
  await assert.rejects(service.invoke(agentInA, observationActions.evidenceGet, { use: "assistant", record_id: recHome }), refused("observation.forbidden"), "agent Home evidence from project");
  await assert.rejects(service.invoke(agentInA, observationActions.coverageGet, { use: "assistant", all_projects: true }), refused("observation.forbidden"), "agent coverage all_projects");
  await assert.rejects(service.invoke(agentInA, observationActions.coverageGet, { use: "assistant", project_id: "proj-b" }), refused("observation.forbidden"), "agent coverage cross project_id");

  const delegated = person({ project_id: "proj-a", delegated_by: "io.molis.work.example" });
  await assert.rejects(service.invoke(delegated, observationActions.recordsQuery, { use: "assistant", all_projects: true }), refused("observation.forbidden"), "delegated user all_projects");
  await assert.rejects(service.invoke(delegated, observationActions.recordsQuery, { use: "assistant", project_id: "proj-b" }), refused("observation.forbidden"), "delegated user cross project_id");

  const across = await service.invoke(person(), observationActions.recordsQuery, { use: "lookback", all_projects: true });
  const seenProjects = new Set(across.records.map(record => record.project_id));
  assert.ok(seenProjects.has("proj-a") && seenProjects.has("proj-b") && seenProjects.has(null));
  assert.ok(!seenProjects.has("proj-closing"), "closing project is excluded from cross-project reads");
  for (const gone of ["proj-closing", "proj-deleted"]) {
    await assert.rejects(service.invoke(person(), observationActions.recordsQuery, { use: "lookback", project_id: gone }), refused("observation.forbidden"), `query ${gone}`);
    await assert.rejects(service.invoke(person(), observationActions.coverageGet, { use: "lookback", project_id: gone }), refused("observation.forbidden"), `coverage ${gone}`);
    await assert.rejects(service.invoke(person(), observationActions.cleanupPreview, { time_range: "before_30d", project_id: gone }), refused("observation.forbidden"), `preview ${gone}`);
    await assert.rejects(service.invoke(person(), observationActions.cleanupApply, { time_range: "before_30d", project_id: gone }), refused("observation.forbidden"), `apply ${gone}`);
  }
});

test("S-observation-records 9: disabled or disallowed observation uses immediately refuse queries, cached evidence reads and coverage", async t => {
  const { service, observation } = home(t, {
    catalogProjects: async () => ["proj-a"],
    openProjects: () => [{ project_id: "proj-a", state: "ready" } as never],
  });
  const seed = {
    capability_id: "test.work", version: 1, operation: "command" as const,
    action: {
      title: "work", description: "work", kind: "operation" as const, scope: "home" as const, effect: "write" as const,
      audiences: ["user" as const, "agent" as const], permissions: [], subject_kinds: [],
      input_schema: { type: "object", properties: { text: { type: "string" } }, additionalProperties: false },
      output_schema: { type: "object" },
    },
  };
  service.registerProvider({
    provider: { provider_id: "system.seed", title: "Seed", kind: "system" },
    definitions: [seed],
    handlers: [{ capability_id: "test.work", version: 1, handle: (_caller, input) => ({ echo: (input as { text: string }).text }) }],
  });
  const agentInA = person({ audience: "agent", actor_kind: "runtime", actor_id: "agent-a", project_id: "proj-a" });
  await service.invoke(agentInA, seed, { text: "real-work-body" });
  await withObservationSource("replay", () => service.invoke(agentInA, seed, { text: "replay-sample-body" }));
  observation.layer.flush();

  await assert.rejects(service.invoke(agentInA, observationActions.recordsQuery, { use: "lookback" }), refused("observation.forbidden"), "non-person lookback");
  await assert.rejects(service.invoke(agentInA, observationActions.coverageGet, { use: "lookback" }), refused("observation.forbidden"), "non-person lookback coverage");
  for (const disabledUse of ["upload", "export"] as const) {
    await assert.rejects(service.invoke(person({ project_id: "proj-a" }), observationActions.recordsQuery, { use: disabledUse }), refused("observation.use_disabled"), `person ${disabledUse}`);
    await assert.rejects(service.invoke(agentInA, observationActions.recordsQuery, { use: disabledUse }), refused("observation.use_disabled"), `agent ${disabledUse}`);
    await assert.rejects(service.invoke(agentInA, observationActions.coverageGet, { use: disabledUse }), refused("observation.use_disabled"), `agent ${disabledUse} coverage`);
  }

  const assistantList = await service.invoke(agentInA, observationActions.recordsQuery, { use: "assistant" });
  assert.ok(assistantList.records.every(record => record.source_class === "real"), "assistant sees real records only");
  const realRecord = assistantList.records.find(record => record.fact === "action.call" && record.detail.action === "test.work@1")!;
  assert.ok(realRecord);
  const unsealedBefore = await service.invoke(agentInA, observationActions.evidenceGet, { use: "assistant", record_id: realRecord.record_id, role: "input" });
  assert.match(JSON.stringify(unsealedBefore.items), /real-work-body/u);

  const replayRecord = readRecords(observation.layer.writer.database()!.db, { include_synthetic: true }).find(record => record.source_class === "replay")!;
  assert.ok(replayRecord);
  await assert.rejects(service.invoke(agentInA, observationActions.evidenceGet, { use: "assistant", record_id: replayRecord.record_id }), refused("observation.forbidden"),
    "assistant cannot unseal replay/demo evidence by record_id");

  await service.invoke(person(), observationActions.settingsSet, { uses: { assistant: false, evaluation: false } });
  await assert.rejects(service.invoke(agentInA, observationActions.recordsQuery, { use: "assistant" }), refused("observation.use_disabled"), "assistant query disabled");
  await assert.rejects(service.invoke(agentInA, observationActions.coverageGet, { use: "assistant" }), refused("observation.use_disabled"), "assistant coverage disabled");
  await assert.rejects(service.invoke(agentInA, observationActions.evidenceGet, { use: "assistant", record_id: realRecord.record_id }), refused("observation.use_disabled"),
    "cached record_id immediately refused once assistant is turned off");
  await assert.rejects(service.invoke(person({ project_id: "proj-a" }), observationActions.recordsQuery, { use: "evaluation" }), refused("observation.use_disabled"), "evaluation disabled");
  const lookbackStillWorks = await service.invoke(person({ project_id: "proj-a" }), observationActions.evidenceGet, { use: "lookback", record_id: realRecord.record_id, role: "input" });
  assert.match(JSON.stringify(lookbackStillWorks.items), /real-work-body/u, "person's own lookback remains open");
});

test("S-observation-records 10: management actions and /api/observation routes refuse non-person, delegated and plugin-page callers", { timeout: 90_000 }, async t => {
  const { service } = home(t);
  const management = [
    [observationActions.settingsGet, {}],
    [observationActions.settingsSet, { paused: true }],
    [observationActions.spaceGet, {}],
    [observationActions.cleanupPreview, { time_range: "before_30d" }],
    [observationActions.cleanupApply, { time_range: "before_30d" }],
  ] as const;

  for (const audience of ["agent", "mcp", "workflow", "plugin"] as const) {
    const caller = audience === "plugin" ? plugin("notes") : person({ audience, actor_kind: "runtime", actor_id: `${audience}-1`, project_id: "proj-a" });
    const discovered = new Set((await service.discover(caller)).map(view => view.capability_id));
    for (const [action, input] of management) {
      assert.ok(!discovered.has(action.capability_id), `${audience} does not discover ${action.capability_id}`);
      await assert.rejects(service.invoke(caller, action as never, input as never), (error: unknown) => error instanceof ActionError, `${audience} refused ${action.capability_id}`);
    }
  }
  const delegated = person({ delegated_by: "io.molis.work.example" });
  for (const [action, input] of management) {
    await assert.rejects(service.invoke(delegated, action as never, input as never), refused("observation.forbidden"), `delegated user refused ${action.capability_id}`);
  }

  // P1-E3: observation.preferences.read@1 and .write@1 require the direct local person (zero-permission plugins, agents, delegated callers refused).
  const prefCalls = [
    [retentionActions.read, { keys: [RETENTION_KEY] }],
    [retentionActions.write, { key: RETENTION_KEY, layer: "personal", change: { set: "keep" }, expected_revision: "0", request_id: "forged-pref" }],
  ] as const;
  for (const audience of ["agent", "mcp", "workflow", "plugin"] as const) {
    const caller = audience === "plugin" ? plugin("notes") : person({ audience, actor_kind: "runtime", actor_id: `${audience}-1`, project_id: "proj-a" });
    const discovered = await service.discover(caller);
    for (const [action, input] of prefCalls) {
      const view = discovered.find(entry => entry.capability_id === action.capability_id);
      assert.ok(!view || !view.availability.available, `${audience} does not see ${action.capability_id} as available`);
      await assert.rejects(service.invoke(caller, action as never, input as never), (error: unknown) => error instanceof ActionError, `${audience} refused ${action.capability_id}`);
    }
  }
  for (const [label, badUser] of [
    ["delegated", person({ delegated_by: "io.molis.work.example" })],
    ["calling_plugin_id", person({ calling_plugin_id: "io.molis.work.example" })],
  ] as const) {
    for (const [action, input] of prefCalls) {
      await assert.rejects(service.invoke(badUser, action as never, input as never), refused("observation.forbidden"), `${label} refused ${action.capability_id}`);
    }
  }
  const ownPref = await service.invoke(person(), retentionActions.read, { keys: [RETENTION_KEY] }) as { values: unknown[] };
  assert.equal(ownPref.values.length, 1);

  const served = await openTestHome(t, { catalogPolicy: false });
  const okGet = await fetch(`${served.origin}/api/observation/settings`, { headers: { origin: served.origin } });
  assert.equal(okGet.status, 200);

  for (const [label, headers] of [
    ["x-molis-plugin-page", { origin: served.origin, "x-molis-plugin-page": "1" }],
    ["x-molis-context-page", { origin: served.origin, "x-molis-context-page": "1" }],
  ] as const) {
    const deniedGet = await fetch(`${served.origin}/api/observation/settings`, { headers });
    assert.equal(deniedGet.status, 403, `${label} GET refused`);
    const deniedBody = await deniedGet.json() as { code?: string; error?: { code?: string } | string };
    assert.equal(deniedBody.code ?? (typeof deniedBody.error === "object" ? deniedBody.error?.code : undefined), "actions.forbidden", `${label} GET code`);
    const deniedPost = await fetch(`${served.origin}/api/observation/settings/set`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json", "x-molis-work-control-token": served.controlToken, "x-molis-work-idempotency-key": randomUUID() },
      body: JSON.stringify({ paused: true }),
    });
    assert.equal(deniedPost.status, 403, `${label} POST refused`);
  }

  const missingToken = await fetch(`${served.origin}/api/observation/settings/set`, {
    method: "POST",
    headers: { origin: served.origin, "content-type": "application/json", "x-molis-work-idempotency-key": randomUUID() },
    body: JSON.stringify({ paused: true }),
  });
  assert.equal(missingToken.status, 403, "POST without control token refused");
});

test("S-observation-records 11: evaluation hold actions enforce person-only access, evaluation use switch and project reach", async t => {
  const liveProjects = new Set(["proj-a", "proj-b"]);
  const { service, observation } = home(t, { readableProjects: async () => [...liveProjects] });

  observation.layer.sink("assistant").bind({ kind: "background", entry: "workbench", actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "proj-a" })
    .record({ fact: "assistant.work", outcome: "succeeded", subjects: [{ kind: "goal", id: "goal-a" }], detail: { step: "draft" } });
  observation.layer.sink("assistant").bind({ kind: "background", entry: "workbench", actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "proj-b" })
    .record({ fact: "assistant.work", outcome: "succeeded", subjects: [{ kind: "goal", id: "goal-b" }], detail: { step: "draft" } });
  observation.layer.flush();

  const queried = await service.invoke(person({ project_id: "proj-a" }), observationActions.recordsQuery, { use: "evaluation", all_projects: true });
  const recA = queried.records.find(rec => rec.project_id === "proj-a")!;
  const recB = queried.records.find(rec => rec.project_id === "proj-b")!;
  assert.ok(recA && recB);

  const holdCalls = [
    [observationActions.holdsPut, { hold_id: "h-1", sample_id: "s-1", record_ids: [recA.record_id] }],
    [observationActions.holdsList, {}],
    [observationActions.holdsRelease, { hold_id: "h-1" }],
  ] as const;

  for (const audience of ["agent", "mcp", "workflow", "plugin"] as const) {
    const caller = audience === "plugin" ? plugin("notes") : person({ audience, actor_kind: "runtime", actor_id: `${audience}-1`, project_id: "proj-a" });
    const discovered = new Set((await service.discover(caller)).map(view => view.capability_id));
    for (const [action, input] of holdCalls) {
      assert.ok(!discovered.has(action.capability_id), `${audience} does not discover ${action.capability_id}`);
      await assert.rejects(service.invoke(caller, action as never, input as never), (error: unknown) => error instanceof ActionError, `${audience} refused ${action.capability_id}`);
    }
  }
  const delegated = person({ delegated_by: "io.molis.work.example" });
  for (const [action, input] of holdCalls) {
    await assert.rejects(service.invoke(delegated, action as never, input as never), refused("observation.forbidden"), `delegated user refused ${action.capability_id}`);
  }

  // Project mismatch and closing/deleted project refusal
  await assert.rejects(
    service.invoke(person(), observationActions.holdsPut, { hold_id: "h-mismatch", sample_id: "s-1", project_id: "proj-a", record_ids: [recB.record_id] }),
    refused("observation.forbidden"),
    "record outside declared project_id refused",
  );
  liveProjects.delete("proj-b");
  await assert.rejects(
    service.invoke(person(), observationActions.holdsPut, { hold_id: "h-closed", sample_id: "s-1", record_ids: [recB.record_id] }),
    refused("observation.forbidden"),
    "record in closing/deleted project refused",
  );
  await assert.rejects(
    service.invoke(person(), observationActions.holdsList, { project_id: "proj-b" }),
    refused("observation.forbidden"),
    "listing holds for closing/deleted project refused",
  );

  // Place valid hold on proj-a, then turn off `evaluation` use: put and list are refused immediately, while release remains allowed
  await service.invoke(person(), observationActions.holdsPut, { hold_id: "h-valid", sample_id: "s-1", project_id: "proj-a", record_ids: [recA.record_id] });
  await service.invoke(person(), observationActions.settingsSet, { uses: { evaluation: false } });
  await assert.rejects(
    service.invoke(person(), observationActions.holdsPut, { hold_id: "h-valid-2", sample_id: "s-2", record_ids: [recA.record_id] }),
    refused("observation.use_disabled"),
    "holds.put refused when evaluation use is disabled",
  );
  await assert.rejects(
    service.invoke(person(), observationActions.holdsList, {}),
    refused("observation.use_disabled"),
    "holds.list refused when evaluation use is disabled",
  );
  const released = await service.invoke(person(), observationActions.holdsRelease, { hold_id: "h-valid" });
  assert.deepEqual(released.released_hold_ids, ["h-valid"]);
});
