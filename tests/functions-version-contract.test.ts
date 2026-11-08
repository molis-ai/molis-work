// What the six editing actions of a judgment rule answer, for every kind of caller and every state of the record
// (specs/action-input-contracts/spec.md §2.1, §2.6). Each refusal leaves the record as it was.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ActionError, type ActionCallContext, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { JudgmentRuleRecord, TypeSafeProvider } from "@molis-ai/molis-work-contracts/modules/functions";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { actionErrorKind, actionHttpStatus } from "@molis-ai/molis-work-plugin-sdk";
import { createFunctionsService, functionAuthoringActions as authoring, functionsActionProvider, type FunctionsService } from "@molis-ai/molis-work-module-judgment-rules";

const criteria = { true_description: "Yes", false_description: "No" };
const caller = (audience: ActionCallContext["audience"]): ActionCallContext => ({ actor_id: "owner", project_id: null, audience, permissions: ["functions:manage", "functions:invoke"] });
const AI = ["agent", "mcp"] as const;

async function fixture(t: TestContext, name: string, evaluate?: (record: JudgmentRuleRecord) => Promise<void>) {
  const home = await mkdtemp(join(tmpdir(), `functions-contract-${name}-`));
  let trials = 0;
  const provider: TypeSafeProvider = { async evaluate(_key, record) { trials++; await evaluate?.(record);
    return { primitive: record.primitive, noul: .8, choice: null, score: null, legend: null, probabilities: {}, confidence: null, model: record.model }; } };
  const rules: FunctionsService = createFunctionsService({ home, credential: () => null, env: { TYPESAFE_API_KEY: "fixture-only" }, provider });
  const service = new ActionService();
  service.registerProvider(functionsActionProvider({ read: operation => operation(rules), run: operation => operation(rules), credentialAvailable: () => true }));
  t.after(async () => { rules.close(); await rm(home, { recursive: true, force: true }); });
  const invoke = (action: ActionDefinition, input: unknown, audience: ActionCallContext["audience"] = "user") => service.invoke(caller(audience), action, input);
  const draft = () => { const created = rules.create({ primitive: "noul", name: "Rule" }); return rules.updateDraft(created.id, { instructions: "Decide", criteria }, created.updated_at); };
  return { rules, invoke, draft, trials: () => trials };
}

/** The input of each of the six actions, without a version. */
const sixActions = (record: JudgmentRuleRecord, sampleId = "absent") => [
  [authoring.update, { id: record.id, patch: { name: "Mine" } }],
  [authoring.preview, { id: record.id, input: "Example" }],
  [authoring.publish, { id: record.id }],
  [authoring.delete, { id: record.id }],
  [authoring.addSample, { id: record.id, input: "Example" }],
  [authoring.removeSample, { id: record.id, sample_id: sampleId }],
] as const;

test("AIC-01: without expected_updated_at an AI caller is told to send the version it read, a page that its input is wrong, and nothing changes", async t => {
  const { rules, invoke, draft, trials } = await fixture(t, "missing");
  const record = draft(), before = rules.get(record.id);
  for (const [action, input] of sixActions(record)) {
    for (const audience of AI) await assert.rejects(invoke(action, input, audience), { code: "actions.version_required" }, `${action.capability_id} ${audience}`);
    for (const audience of ["user", "workflow"] as const) await assert.rejects(invoke(action, input, audience), { code: "actions.input_invalid" }, `${action.capability_id} ${audience}`);
    assert.deepEqual(rules.get(record.id), before, action.capability_id);
  }
  // A plugin page's audience, where the action is offered to plugins.
  for (const [action, input] of sixActions(record)) if (action.action.audiences.includes("plugin"))
    await assert.rejects(invoke(action, input, "plugin"), { code: "actions.input_invalid" }, action.capability_id);
  assert.equal(trials(), 0);
});

test("AIC-02: null, an empty string and the old field name are refused for every caller, and nothing changes", async t => {
  const { rules, invoke, draft, trials } = await fixture(t, "invalid");
  const record = draft(), before = rules.get(record.id);
  for (const [action, input] of sixActions(record)) for (const audience of [...AI, "user"] as const) {
    for (const bad of [{ expected_updated_at: null }, { expected_updated_at: "" }, { expected_updated_at: record.updated_at, updated_at: record.updated_at }])
      await assert.rejects(invoke(action, { ...input, ...bad }, audience), { code: "actions.input_invalid" }, `${action.capability_id} ${audience} ${JSON.stringify(bad)}`);
    await assert.rejects(invoke(action, { ...input, updated_at: record.updated_at }, audience), { code: "actions.input_invalid" }, `${action.capability_id} ${audience} old field`);
    assert.deepEqual(rules.get(record.id), before, action.capability_id);
  }
  assert.equal(trials(), 0);
});

test("AIC-03: an old version is draft_stale, a 409 that names the rule and carries none of its content, and nothing changes", async t => {
  const { rules, invoke, draft, trials } = await fixture(t, "stale");
  const record = draft();
  const withSample = rules.addSample(record.id, { input: "Kept" }, record.updated_at);
  const moved = rules.updateDraft(record.id, { instructions: "Decide again" }, record.updated_at), before = rules.get(record.id);
  assert.ok(moved.updated_at > record.updated_at);
  for (const [action, input] of sixActions(record, withSample.samples[0]!.id)) {
    await assert.rejects(invoke(action, { ...input, expected_updated_at: record.updated_at }), (error: unknown) => {
      assert.ok(error instanceof ActionError);
      assert.equal(error.code, "functions.draft_stale", action.capability_id);
      assert.equal(actionErrorKind(error), "conflict");
      assert.equal(actionHttpStatus(error), 409);
      assert.deepEqual(error.details, { id: record.id }, "the id, none of the content");
      return true;
    });
    assert.deepEqual(rules.get(record.id), before, action.capability_id);
  }
  assert.equal(trials(), 0);
});

test("AIC-04: publishing what the caller read is idempotent, publishing over an earlier read is refused, and a stale publish is not told to preview first", async t => {
  const { rules, invoke, draft } = await fixture(t, "publish");
  const unprepared = draft(), read = unprepared.updated_at;
  // The version comes before every other check: a stale publish is not "preview first".
  const moved = rules.updateDraft(unprepared.id, { name: "Moved on" }, read);
  await assert.rejects(invoke(authoring.publish, { id: unprepared.id, expected_updated_at: read }), { code: "functions.draft_stale" });
  await assert.rejects(invoke(authoring.publish, { id: unprepared.id, expected_updated_at: moved.updated_at }), { code: "functions.preview_required" });
  await rules.preview(unprepared.id, "Example", moved.updated_at);
  const published = (await invoke(authoring.publish, { id: unprepared.id, expected_updated_at: moved.updated_at }) as { function: JudgmentRuleRecord }).function;
  assert.equal(published.status, "published");
  const snapshot = rules.get(unprepared.id);
  assert.deepEqual((await invoke(authoring.publish, { id: unprepared.id, expected_updated_at: moved.updated_at }) as { function: JudgmentRuleRecord }).function, snapshot, "a retry, or someone else's publish of the version this caller read");
  await assert.rejects(invoke(authoring.publish, { id: unprepared.id, expected_updated_at: read }), (error: unknown) => {
    assert.ok(error instanceof ActionError); assert.equal(error.code, "functions.published_immutable"); assert.deepEqual(error.details, { id: unprepared.id }); return true;
  });
  assert.deepEqual(rules.get(unprepared.id), snapshot);
});

test("AIC-04: published rules answer each action by the table, and a rule that is gone answers not_found first", async t => {
  const { rules, invoke, draft } = await fixture(t, "table");
  const old = draft(), current = rules.updateDraft(old.id, { name: "Current" }, old.updated_at);
  await rules.preview(old.id, "Example", current.updated_at);
  const published = rules.publish(old.id, current.updated_at);
  // An edit or a delete is refused whichever version was read.
  for (const version of [current.updated_at, old.updated_at]) {
    await assert.rejects(invoke(authoring.update, { id: old.id, expected_updated_at: version, patch: { name: "Mine" } }), { code: "functions.published_immutable" });
    await assert.rejects(invoke(authoring.delete, { id: old.id, expected_updated_at: version }), { code: "functions.published_immutable" });
  }
  // A trial or a sample goes on against the published version; over an earlier read it is stale.
  await assert.rejects(invoke(authoring.preview, { id: old.id, input: "Example", expected_updated_at: old.updated_at }), { code: "functions.draft_stale" });
  await assert.rejects(invoke(authoring.addSample, { id: old.id, input: "Example", expected_updated_at: old.updated_at }), { code: "functions.draft_stale" });
  const sampled = (await invoke(authoring.addSample, { id: old.id, input: "Example", expected_updated_at: published.updated_at }) as { function: JudgmentRuleRecord }).function;
  assert.equal(sampled.samples.length, 1);
  await assert.rejects(invoke(authoring.removeSample, { id: old.id, sample_id: sampled.samples[0]!.id, expected_updated_at: old.updated_at }), { code: "functions.draft_stale" });
  assert.equal(((await invoke(authoring.preview, { id: old.id, input: "Again", expected_updated_at: published.updated_at })) as { function: JudgmentRuleRecord }).function.last_preview?.input, "Again");
  for (const [action, input] of sixActions({ ...old, id: "no-such-rule" }))
    await assert.rejects(invoke(action, { ...input, expected_updated_at: "2026-10-16T08:00:00.000Z" }), { code: "functions.not_found" }, action.capability_id);
});

test("AIC-05: a stale preview never reaches the model; an edit during the model call refuses the result and writes nothing", async t => {
  let during: (() => void) | undefined;
  const context = await fixture(t, "preview", async () => { during?.(); });
  const { rules, invoke, draft, trials } = context;
  const record = draft();
  const edited = rules.updateDraft(record.id, { instructions: "Edited elsewhere" }, record.updated_at);
  await assert.rejects(invoke(authoring.preview, { id: record.id, input: "Example", expected_updated_at: record.updated_at }), { code: "functions.draft_stale" });
  assert.equal(trials(), 0, "no model call for a version already known to be stale");

  let latest!: JudgmentRuleRecord;
  during = () => { during = undefined; latest = rules.updateDraft(record.id, { name: "Renamed during the call" }, edited.updated_at); };
  await assert.rejects(invoke(authoring.preview, { id: record.id, input: "Example", expected_updated_at: edited.updated_at }), { code: "functions.draft_stale" });
  assert.equal(trials(), 1);
  assert.deepEqual(rules.get(record.id), latest, "the result of the call is not written");
  assert.equal(latest.last_preview, null);
});

test("AIC-15: a sample that is gone is sample_not_found, not the rule being gone", async t => {
  const { rules, invoke, draft } = await fixture(t, "sample");
  const record = draft(), before = rules.get(record.id);
  await assert.rejects(invoke(authoring.removeSample, { id: record.id, sample_id: "absent", expected_updated_at: record.updated_at }), (error: unknown) => {
    assert.ok(error instanceof ActionError); assert.equal(error.code, "functions.sample_not_found"); assert.equal(actionHttpStatus(error), 404); return true;
  });
  assert.deepEqual(rules.get(record.id), before);
});

test("AIC-08: the latest record is offered to a plugin page, under the same permission as the list it can already read", async t => {
  const { invoke, draft } = await fixture(t, "plugin-get");
  assert.ok(authoring.get.action.audiences.includes("plugin"));
  assert.deepEqual(authoring.get.action.permissions, authoring.list.action.permissions);
  const record = draft();
  assert.equal((await invoke(authoring.get, { id: record.id }, "plugin") as { function: JudgmentRuleRecord }).function.updated_at, record.updated_at);
});
