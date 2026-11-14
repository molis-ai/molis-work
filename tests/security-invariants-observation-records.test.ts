import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { OBSERVATION_LIMITS, observationActions } from "@molis-ai/molis-work-contracts/services/observation";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { createHostObservation, installHostUiText, observationShellDoor, webEntryDoor, type HostObservation } from "@molis-ai/molis-work-app-local-host";
import { readRecords } from "@molis-ai/molis-work-service-observation";

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

function home(t: test.TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "observation-records-"));
  let observation: HostObservation | undefined;
  const service = new ActionService(undefined, { observed: (caller, action, value) => observation?.observed(caller, action, value) });
  observation = createHostObservation(directory);
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
