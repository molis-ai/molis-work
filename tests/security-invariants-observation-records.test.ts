import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { observationActions } from "@molis-ai/molis-work-contracts/services/observation";
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
  observation = createHostObservation(directory, service);
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
