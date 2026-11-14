import assert from "node:assert/strict";
import test from "node:test";
import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { RISK_WRITE, riskActions, type RiskRecord } from "@molis-ai/molis-work-plugin-risk";
import { WORK_BRIEF_WRITE, workBriefActions, type BriefRefreshed, type BriefSaved, type BriefView } from "@molis-ai/molis-work-plugin-work-brief";
import { person, serveHomeRuntime } from "./fixtures/home-runtime.js";

// Work Brief in a project that has no Goals: its sources are whatever the directory offers (here Risk), read as the caller.

const ref = (definition: { capability_id: string; version: number }) => ({ capability_id: definition.capability_id, version: definition.version });
const code = async (operation: Promise<unknown>) => { try { await operation; return "accepted"; } catch (error) { return error instanceof ActionError ? error.code : String(error); } };
const RISK_ID = "io.molis.work.risk";

async function fixture(t: Parameters<typeof serveHomeRuntime>[0]) {
  const f = await serveHomeRuntime(t), { host } = f;
  const here = await f.project("简报项目");
  for (const plugin_id of ["risk", "work-brief"]) {
    const index = await f.request("/api/settings/project-plugins");
    const { projects } = await index.json() as { projects: Array<{ project_id: string; revision: string; plugins?: unknown }> };
    const revision = projects.find(row => row.project_id === here.project_id)!.revision;
    const added = await f.request(`/api/settings/projects/${encodeURIComponent(here.project_id)}/plugins`, { method: "POST", body: { plugin_id, expected_revision: revision } });
    assert.equal(added.status, 200, await added.clone().text());
  }
  const client = host.actionClient(here.reference);
  const caller: ActionCallContext = person([...RISK_WRITE, ...WORK_BRIEF_WRITE], here.project_id);
  const call = <O>(definition: { capability_id: string; version: number }, input: unknown, who: ActionCallContext = caller) => client.invoke(who, ref(definition), input) as Promise<O>;
  const risk = async (title: string) => (await call<{ risk: RiskRecord }>(riskActions.create, { title, statement: "s", impact: "high", likelihood: "medium" })).risk;
  return { f, here, call, caller, risk, client };
}

test("WBR-10 WBR-12 a refresh reads the sources without a model, saves a version only when something changed and reports only the change", { timeout: 90_000 }, async t => {
  const { call, risk, client, caller } = await fixture(t);
  assert.equal((await client.discover(caller)).some(view => view.provider.plugin_id === "io.molis.work.goals"), false, "the project has no Goals");
  assert.deepEqual(await call<BriefView>(workBriefActions.get, {}), { brief: null, version: null, versions: [], proposal: null, edits: [], marks: [] });
  const first = await call<BriefRefreshed>(workBriefActions.refresh, {});
  assert.equal(first.changed, true);
  assert.equal(first.version.version, 1);
  const source = first.version.sources.find(row => row.plugin_id === RISK_ID)!;
  assert.deepEqual([source.read, source.subjects.length, source.turn], ["none", 0, "idle"].map((value, index) => index === 0 && source.summary ? "ok" : value));
  const again = await call<BriefRefreshed>(workBriefActions.refresh, {});
  assert.equal(again.changed, false);
  assert.equal(again.brief.current_version, 1, "nothing changed, nothing saved");
  const made = await risk("供应商延期");
  const moved = await call<BriefRefreshed>(workBriefActions.refresh, {});
  assert.equal(moved.changed, true);
  assert.deepEqual(moved.changes.filter(change => change.kind === "source").map(change => [change.plugin_id, change.subjects_added, change.subjects_removed]), [[RISK_ID, 1, 0]]);
  const row = moved.version.sources.find(entry => entry.plugin_id === RISK_ID)!;
  assert.deepEqual(row.subjects, [{ kind: "risk", id: made.risk_id }]);
  assert.equal(row.turn, "moving");
  assert.equal(moved.version.version, 2);
});

test("WBR-03 WBR-07 a saved brief freezes what each sentence stood on; an unreadable basis refuses the save, a repeated request saves once", { timeout: 90_000 }, async t => {
  const { call, risk } = await fixture(t);
  const made = await risk("供应商延期");
  const cite = { kind: "risk", id: made.risk_id };
  const draft = { claims: [{ text: "交付有延期风险。", cites: [cite] }, { text: "我已口头确认预算。", supplied_by: "owner" }],
    attention: [{ subject: cite, why: "要决定是否换供应商" }], next: [{ text: "让助理起草备选方案", why: "还没有备选", act: { kind: "assistant" } }] };
  const saved = await call<BriefSaved>(workBriefActions.save, { request_id: "r-1", draft });
  assert.equal(saved.proposal, null);
  const version = saved.version!;
  assert.deepEqual(version.claims.map(claim => [claim.text, claim.cites.map(entry => [entry.subject, entry.title, entry.revision, entry.owner_plugin_id]), claim.supplied_by]),
    [["交付有延期风险。", [[cite, "供应商延期", "1", RISK_ID]], undefined], ["我已口头确认预算。", [], "owner"]]);
  assert.equal(version.sources.find(row => row.plugin_id === RISK_ID)!.turn, "waiting", "something of this source waits for the person");
  assert.deepEqual(await call<BriefSaved>(workBriefActions.save, { request_id: "r-1", draft }), saved, "the same request returns the same result");
  assert.equal((await call<BriefView>(workBriefActions.get, {})).versions.length, 1);
  assert.equal(await code(call(workBriefActions.save, { request_id: "r-1", draft: { claims: [{ text: "另一份", supplied_by: "owner" }] } })), "work_brief.conflict");
  for (const [claims, expected] of [
    [[{ text: "没有依据的断言。" }], "work_brief.invalid"],
    [[{ text: "口述却带依据。", supplied_by: "owner", cites: [cite] }], "work_brief.invalid"],
    [[{ text: "依据不存在。", cites: [{ kind: "risk", id: "risk-gone" }] }], "work_brief.cite_unreadable"],
    [[{ text: "种类没人提供。", cites: [{ kind: "nobody", id: "x" }] }], "work_brief.cite_unreadable"],
  ] as const) assert.equal(await code(call(workBriefActions.save, { request_id: "r-" + expected + claims[0]!.text, draft: { claims } })), expected);
  assert.equal((await call<BriefView>(workBriefActions.get, {})).versions.length, 1, "a refused draft saves nothing");
});
