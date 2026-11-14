import assert from "node:assert/strict";
import test from "node:test";
import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { RISK_WRITE, riskActions, type RiskRecord } from "@molis-ai/molis-work-plugin-risk";
import { WORK_BRIEF_PLUGIN_ID, WORK_BRIEF_VIEW_ID, WORK_BRIEF_WRITE, workBriefActions, workBriefPersonalActions, workBriefPresentationActions, type PersonalView, type BriefRefreshed, type BriefSaved, type BriefVersion, type BriefView } from "@molis-ai/molis-work-plugin-work-brief";
import type { PresentationOverview } from "@molis-ai/molis-work-contracts/platform/presentation";
import { surfaceCompositionActions, type SurfaceDescription } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { takeBackGoals } from "./fixtures/goals-agreement.js";
import { person, serveHomeRuntime } from "./fixtures/home-runtime.js";

// Work Brief in a project that has no Goals: its sources are whatever the directory offers (here Risk), read as the caller.

const ref = (definition: { capability_id: string; version: number }) => ({ capability_id: definition.capability_id, version: definition.version });
const code = async (operation: Promise<unknown>) => { try { await operation; return "accepted"; } catch (error) { return error instanceof ActionError ? error.code : String(error); } };
const RISK_ID = "io.molis.work.risk";

async function fixture(t: Parameters<typeof serveHomeRuntime>[0]) {
  const f = await serveHomeRuntime(t), { host } = f;
  // Decision 42: the projects carry no Goals. The person took back the agreement that keeps it in every project before making them.
  takeBackGoals(f.home);
  const open = async (name: string, plugins: readonly string[] = ["risk", "work-brief"]) => {
    const here = await f.project(name);
    const revision = async () => {
      const { projects } = await (await f.request("/api/settings/project-plugins")).json() as { projects: Array<{ project_id: string; revision: string; plugins: string[] }> };
      const row = projects.find(entry => entry.project_id === here.project_id)!;
      assert.equal(row.plugins.includes("goals"), false, "the project has no Goals");
      return row.revision;
    };
    const path = `/api/settings/projects/${encodeURIComponent(here.project_id)}/plugins`;
    const change = async (method: "POST" | "DELETE", plugin_id: string) => {
      const answer = await f.request(path, { method, body: { plugin_id, expected_revision: await revision() } });
      assert.equal(answer.status, 200, await answer.clone().text());
    };
    for (const plugin_id of plugins) await change("POST", plugin_id);
    const client = host.actionClient(here.reference);
    const caller: ActionCallContext = person([...RISK_WRITE, ...WORK_BRIEF_WRITE, "artifact:write", "artifact:read"], here.project_id);
    const call = <O>(definition: { capability_id: string; version: number }, input: unknown, who: ActionCallContext = caller) => client.invoke(who, ref(definition), input) as Promise<O>;
    const risk = async (title: string) => (await call<{ risk: RiskRecord }>(riskActions.create, { title, statement: "s", impact: "high", likelihood: "medium" })).risk;
    const riskNow = async (id: string) => (await call<{ risk: RiskRecord }>(riskActions.get, { risk_id: id })).risk;
    return { here, call, caller, risk, riskNow, client, change };
  };
  return { f, host, open, ...await open("简报项目") };
}
let request = 0;
const once = () => "request-" + ++request;

test("WBR-10 WBR-12 a refresh reads the sources without a model, saves a version only when something changed and reports only the change", { timeout: 90_000 }, async t => {
  const { call, risk, client, caller } = await fixture(t);
  const offered = await client.discover(caller);
  assert.equal(offered.some(view => view.provider.plugin_id === "io.molis.work.goals" && view.action.scope !== "home"), false, "nothing of Goals is offered in this project");
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

test("WBR-05 a draft that disagrees with the person's own change waits as a proposal; mine, theirs and discard each leave the other side intact", { timeout: 90_000 }, async t => {
  const { call, caller, risk } = await fixture(t);
  const cite = { kind: "risk", id: (await risk("供应商延期")).risk_id };
  const assistant: ActionCallContext = { ...caller, audience: "agent" };
  const first = await call<BriefSaved>(workBriefActions.save, { request_id: once(), draft: { claims: [{ text: "交付有延期风险。", cites: [cite] }, { text: "预算充足。", cites: [cite] }] } }, assistant);
  assert.deepEqual(first.version!.produced_by, { kind: "assistant" });
  const [a, b] = first.version!.claims.map(claim => claim.claim_id) as [string, string];
  const edited = await call<BriefSaved>(workBriefActions.edit, { brief_id: first.brief.brief_id, expected_revision: first.brief.revision, claim_id: a, text: "交付会晚两周。" });
  assert.equal(edited.version!.version, 2);
  assert.deepEqual(edited.version!.claims.map(claim => [claim.text, claim.edited, claim.cites.length]), [["交付会晚两周。", true, 1], ["预算充足。", undefined, 1]]);
  assert.equal(await code(call(workBriefActions.edit, { brief_id: first.brief.brief_id, expected_revision: first.brief.revision, claim_id: a, text: "旧版本号" })), "work_brief.conflict");
  // A draft that words that sentence differently does not overwrite it: it waits, the brief stays at the person's version.
  const draft = { claims: [{ claim_id: a, text: "交付没有风险。", cites: [cite] }, { claim_id: b, text: "预算还有余量。", cites: [cite] }] };
  const waiting = await call<BriefSaved>(workBriefActions.save, { request_id: once(), draft }, assistant);
  assert.equal(waiting.brief.current_version, 2);
  assert.deepEqual(waiting.proposal!.conflicts, [{ claim_id: a, mine: "交付会晚两周。", theirs: "交付没有风险。" }]);
  assert.equal(await code(call(workBriefActions.save, { request_id: once(), draft }, assistant)), "work_brief.proposal_pending");
  const resolve = (input: Record<string, unknown>) => call<BriefSaved>(workBriefActions.resolve, { brief_id: first.brief.brief_id, proposal_id: waiting.proposal!.proposal_id, expected_revision: waiting.brief.revision, ...input });
  assert.equal(await code(resolve({ choices: [] })), "work_brief.invalid", "every conflict needs a choice");
  const merged = await resolve({ choices: [{ claim_id: a, take: "mine" }] });
  assert.equal(merged.proposal, null);
  assert.deepEqual(merged.version!.claims.map(claim => claim.text), ["交付会晚两周。", "预算还有余量。"], "the person's sentence stays, the rest of the draft is taken");
  assert.equal((await call<BriefView>(workBriefActions.get, {})).edits.length, 1, "the kept change still stands against later drafts");
  // Next round: theirs replaces the person's wording and the change is no longer held against drafts; discard leaves the brief as it was.
  const again = await call<BriefSaved>(workBriefActions.save, { request_id: once(), draft }, assistant);
  const taken = await call<BriefSaved>(workBriefActions.resolve, { brief_id: first.brief.brief_id, proposal_id: again.proposal!.proposal_id, expected_revision: again.brief.revision, choices: [{ claim_id: a, take: "theirs" }] });
  assert.deepEqual(taken.version!.claims.map(claim => claim.text), ["交付没有风险。", "预算还有余量。"]);
  assert.equal((await call<BriefView>(workBriefActions.get, {})).edits.length, 0);
  const mine = await call<BriefSaved>(workBriefActions.edit, { brief_id: first.brief.brief_id, expected_revision: taken.brief.revision, text: "我自己补的一句。" });
  assert.deepEqual(mine.version!.claims.at(-1)!.supplied_by, "owner");
  const third = await call<BriefSaved>(workBriefActions.save, { request_id: once(), draft }, assistant);
  assert.deepEqual(third.proposal!.conflicts.map(conflict => [conflict.mine, conflict.theirs]), [["我自己补的一句。", null]]);
  const dropped = await call<BriefSaved>(workBriefActions.resolve, { brief_id: first.brief.brief_id, proposal_id: third.proposal!.proposal_id, expected_revision: third.brief.revision, discard: true });
  assert.equal(dropped.proposal, null);
  assert.equal(dropped.brief.current_version, mine.brief.current_version, "discarding a proposal changes nothing");
  const view = await call<BriefView>(workBriefActions.get, { compare_with: 1 });
  assert.ok(view.changes!.some(change => change.kind === "claim" && change.change === "reworded" && change.claim_id === a));
  assert.ok(view.changes!.some(change => change.kind === "claim" && change.change === "added"));
});

test("WBR-04 WBR-27 a fixed version is an artifact and read-only; later changes of the brief and of its sources leave it as it was", { timeout: 90_000 }, async t => {
  const { call, risk, riskNow } = await fixture(t);
  const made = await risk("供应商延期"), cite = { kind: "risk", id: made.risk_id };
  const saved = await call<BriefSaved>(workBriefActions.save, { request_id: once(), title: "周报", draft: { claims: [{ text: "交付有延期风险。", cites: [cite] }] } });
  const id = saved.brief.brief_id;
  type Fixed = { brief: BriefSaved["brief"]; version: BriefVersion; artifact: { artifact_id: string; version: number } };
  assert.equal(await code(call(workBriefActions.fix, { brief_id: id, expected_revision: saved.brief.revision + 5 })), "work_brief.conflict");
  const fixed = await call<Fixed>(workBriefActions.fix, { brief_id: id, expected_revision: saved.brief.revision });
  assert.equal(fixed.artifact.version, 1);
  assert.equal(fixed.brief.fixed["1"]!.artifact_id, fixed.artifact.artifact_id);
  assert.equal(fixed.brief.revision, saved.brief.revision + 1);
  assert.deepEqual((await call<Fixed>(workBriefActions.fix, { brief_id: id, version: 1, expected_revision: 99 })).artifact, fixed.artifact, "fixing a fixed version answers with the same artifact");
  // The source changes and the brief moves on; version 1 still says what it said.
  await call(riskActions.update, { risk_id: made.risk_id, expected_revision: 1, title: "供应商已延期" });
  const moved = await call<BriefRefreshed>(workBriefActions.refresh, { brief_id: id });
  assert.deepEqual(moved.changes.filter(change => change.kind === "cite").map(change => change.kind === "cite" && change.change), ["changed"]);
  assert.equal(moved.version.claims[0]!.cites[0]!.title, "供应商已延期");
  const old = await call<BriefView>(workBriefActions.get, { brief_id: id, version: 1, compare_with: 1 });
  assert.equal(old.version!.claims[0]!.cites[0]!.title, "供应商延期");
  assert.equal(old.version!.fixed!.artifact_id, fixed.artifact.artifact_id);
  assert.equal(old.versions.find(head => head.version === 1)!.fixed!.artifact_version, 1);
  const claim = old.version!.claims[0]!.claim_id;
  assert.equal(await code(call(workBriefActions.edit, { brief_id: id, expected_revision: moved.brief.revision, version: 1, claim_id: claim, text: "改历史" })), "work_brief.fixed");
  // Editing the brief's words never writes to the source (WBR-17).
  const before = await riskNow(made.risk_id);
  await call<BriefSaved>(workBriefActions.edit, { brief_id: id, expected_revision: moved.brief.revision, claim_id: claim, text: "风险已经发生。" });
  assert.deepEqual(await riskNow(made.risk_id), before);
  // A second fixed version of the same brief is the next version of the same artifact.
  const now = await call<BriefView>(workBriefActions.get, { brief_id: id });
  const second = await call<Fixed>(workBriefActions.fix, { brief_id: id, expected_revision: now.brief!.revision });
  assert.deepEqual(second.artifact, { artifact_id: fixed.artifact.artifact_id, version: 2 });
});

test("WBR-17 WBR-18 WBR-25 a brief cites a risk through the directory; a later refresh shows its new state and keeps the person's words; a caller without the source sees gaps only", { timeout: 90_000 }, async t => {
  const { call, caller, risk, here } = await fixture(t);
  const made = await risk("供应商延期"), other = await risk("汇率波动");
  const cite = { kind: "risk", id: made.risk_id }, second = { kind: "risk", id: other.risk_id };
  const saved = await call<BriefSaved>(workBriefActions.save, { request_id: once(), draft: {
    claims: [{ text: "交付有延期风险。", cites: [cite] }, { text: "汇率在可控范围。", cites: [second] }], attention: [{ subject: cite, why: "要决定是否换供应商", blocked: true }] } });
  assert.equal(saved.version!.sources.find(row => row.plugin_id === RISK_ID)!.turn, "blocked");
  const id = saved.brief.brief_id, [a, b] = saved.version!.claims.map(claim => claim.claim_id) as [string, string];
  const edited = await call<BriefSaved>(workBriefActions.edit, { brief_id: id, expected_revision: saved.brief.revision, claim_id: b, text: "汇率我自己盯着。" });
  // The owner updates the risk; one risk is closed (it leaves the overview), the saved brief still shows what it stood on then.
  await call(riskActions.update, { risk_id: made.risk_id, expected_revision: 1, title: "供应商延期两周" });
  await call(riskActions.setStatus, { risk_id: other.risk_id, expected_revision: 1, status: "closed", note: "已对冲" });
  const stored = await call<BriefView>(workBriefActions.get, {});
  assert.equal(stored.version!.claims[0]!.cites[0]!.title, "供应商延期");
  const moved = await call<BriefRefreshed>(workBriefActions.refresh, {});
  assert.equal(moved.changed, true);
  assert.deepEqual(moved.changes.map(change => change.kind === "cite" ? [change.claim_id, change.change] : change.kind === "source" ? [change.plugin_id, change.subjects_added, change.subjects_removed] : [change.kind]),
    [[RISK_ID, 0, 1], [a, "changed"], [b, "changed"]]);
  assert.deepEqual(moved.version.claims.map(claim => [claim.text, claim.edited, claim.cites[0]!.title]), [["交付有延期风险。", undefined, "供应商延期两周"], ["汇率我自己盯着。", true, "汇率波动"]]);
  assert.equal(moved.version.version, edited.version!.version + 1);
  assert.equal((await call<BriefRefreshed>(workBriefActions.refresh, {})).changed, false);
  // Without the source's permission: the source is named but unauthorized, each cite is a gap, the waiting item is not shown. The words stay.
  const narrow = person([...WORK_BRIEF_WRITE], here.project_id);
  const masked = await call<BriefView>(workBriefActions.get, {}, narrow);
  const row = masked.version!.sources.find(entry => entry.plugin_id === RISK_ID)!;
  assert.deepEqual([row.read, row.subjects, row.summary], ["unauthorized", [], undefined]);
  assert.deepEqual(masked.version!.claims.map(claim => claim.cites.map(entry => [entry.gap, entry.title])), [[["unreadable", ""]], [["unreadable", ""]]]);
  assert.deepEqual(masked.version!.attention, []);
  assert.equal(JSON.stringify(masked).includes("供应商"), masked.version!.claims[0]!.text.includes("供应商"), "no title of the source leaks");
  assert.equal(await code(call(workBriefActions.save, { request_id: once(), draft: { claims: [{ text: "读不到的依据。", cites: [cite] }] } }, narrow)), "work_brief.cite_unreadable");
  void caller;
});

test("WBR-06 WBR-07 a next step runs the prepared action once as the person; a changed object or a second click does not run it; later and handed are only marks", { timeout: 90_000 }, async t => {
  const { call, caller, client, risk, riskNow } = await fixture(t);
  const made = await risk("供应商延期"), other = await risk("汇率波动");
  const views = await client.discover(caller);
  const reference = (definition: { capability_id: string; version: number }) => {
    const view = views.find(row => row.capability_id === definition.capability_id && row.version === definition.version)!;
    return { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id };
  };
  const cite = { kind: "risk", id: made.risk_id };
  assert.equal(await code(call(workBriefActions.save, { request_id: once(), draft: { claims: [{ text: "一句。", cites: [cite] }],
    next: [{ text: "坏输入", why: "x", act: { kind: "action", reference: reference(riskActions.addNote), input: { risk_id: made.risk_id } } }] } })), "work_brief.invalid");
  const saved = await call<BriefSaved>(workBriefActions.save, { request_id: once(), draft: { claims: [{ text: "交付有延期风险。", cites: [cite] }], next: [
    { text: "记一笔进展", why: "已联系备选", subject: cite, act: { kind: "action", reference: reference(riskActions.addNote), input: { risk_id: made.risk_id, text: "已联系备选供应商" } } },
    { text: "关闭汇率风险", why: "已对冲", act: { kind: "action", reference: reference(riskActions.setStatus), input: { risk_id: other.risk_id, expected_revision: 1, status: "closed", note: "已对冲" } } },
    { text: "让助理起草备选方案", why: "还没有备选", act: { kind: "assistant" } },
  ] } });
  const id = saved.brief.brief_id, [note, close, hand] = saved.version!.next.map(option => option.option_id) as [string, string, string];
  type Mark = { mark: { state: string; card?: { status: string } } };
  const ran = await call<Mark>(workBriefActions.runNext, { brief_id: id, option_id: note });
  assert.equal(ran.mark.state, "done");
  const events = await call<{ events: Array<{ text?: string | null }> }>(riskActions.get, { risk_id: made.risk_id });
  assert.equal(JSON.stringify(events).split("已联系备选供应商").length - 1, 1, "the action ran once, in the owner's own record");
  assert.equal(await code(call(workBriefActions.runNext, { brief_id: id, option_id: note })), "work_brief.option_stale");
  assert.equal(JSON.stringify(await call(riskActions.get, { risk_id: made.risk_id })).split("已联系备选供应商").length - 1, 1);
  // The object the second option would change has moved since the brief was saved: nothing runs.
  await call(riskActions.update, { risk_id: other.risk_id, expected_revision: 1, title: "汇率波动加大" });
  assert.equal(await code(call(workBriefActions.runNext, { brief_id: id, option_id: close })), "work_brief.option_stale");
  assert.equal((await riskNow(other.risk_id)).status, "open");
  assert.equal(await code(call(workBriefActions.runNext, { brief_id: id, option_id: hand })), "work_brief.invalid");
  const marks = async (state: string | null, option = hand) => (await call<{ marks: Array<{ option_id: string; state: string }> }>(workBriefActions.setNext, { brief_id: id, option_id: option, state })).marks.find(mark => mark.option_id === option)?.state;
  assert.equal(await marks("later"), "later");
  assert.equal(await marks("handed"), "handed");
  assert.equal(await marks(null), undefined);
  assert.equal(await code(call(workBriefActions.setNext, { brief_id: id, option_id: note, state: "later" })), "work_brief.conflict", "an option that ran is not re-marked");
  assert.equal(await code(call(workBriefActions.setNext, { brief_id: id, option_id: "gone", state: "later" })), "work_brief.option_stale");
  // Only the person runs a next step: the assistant cannot click for them.
  assert.notEqual(await code(call(workBriefActions.runNext, { brief_id: id, option_id: close }, { ...caller, audience: "agent" })), "accepted");
});

test("WBR-22 WBR-23 with Work Brief in the project the home names its main-area view first, beside every plugin's own card; taken out, the basic home is what is left", { timeout: 90_000 }, async t => {
  const { call, caller, risk, change } = await fixture(t);
  const made = await risk("供应商延期");
  await call<BriefSaved>(workBriefActions.save, { request_id: once(), draft: { claims: [{ text: "交付有延期风险。", cites: [{ kind: "risk", id: made.risk_id }] }] } });
  const home = () => call<SurfaceDescription>(surfaceCompositionActions.compose, { slot: { kind: "home" } }, person([...caller.permissions], caller.project_id));
  const withBrief = await home();
  assert.deepEqual(withBrief.groups.map(group => group.kind).filter(kind => kind === "lead"), ["lead"]);
  const lead = withBrief.groups[0]!;
  assert.deepEqual([lead.kind, lead.owner_plugin_id, lead.lead?.view_id, lead.items.length], ["lead", WORK_BRIEF_PLUGIN_ID, WORK_BRIEF_VIEW_ID, 0]);
  const cards = (description: SurfaceDescription) => description.groups.filter(group => group.kind === "plugin").map(group => [group.owner_plugin_id, group.state]);
  assert.ok(cards(withBrief).some(([owner, state]) => owner === RISK_ID && state === "ok"), "the source keeps its own card");
  assert.ok(cards(withBrief).some(([owner, state]) => owner === WORK_BRIEF_PLUGIN_ID && state === "ok"), "Work Brief is a plugin like the others: it has a card too");
  // Its overview is the same public read every plugin gives: a sentence and the brief as an object, no model.
  const overview = await call<PresentationOverview>(workBriefPresentationActions.find(action => action.capability_id.endsWith("presentation.overview"))!, {});
  assert.equal(overview.subjects.length, 1);
  assert.equal(overview.subjects[0]!.kind, "brief");
  // Taken out of the project: no lead, the other plugins' cards as before, and the source's facts untouched.
  await change("DELETE", "work-brief");
  const basic = await home();
  assert.equal(basic.groups.some(group => group.kind === "lead"), false);
  assert.ok(cards(basic).some(([owner, state]) => owner === RISK_ID && state === "ok"));
  assert.deepEqual(cards(basic).find(([owner]) => owner === WORK_BRIEF_PLUGIN_ID), [WORK_BRIEF_PLUGIN_ID, "disabled"], "what is left of it is the card that offers to add it back");
  // Put back: the brief is still there (its data follows the plugin's lifecycle, not the page's).
  await change("POST", "work-brief");
  assert.equal((await call<BriefView>(workBriefActions.get, {})).version!.claims.length, 1);
  assert.equal((await home()).groups[0]!.kind, "lead");
});

test("WBR-24 the personal brief gathers what waits in the briefs of the projects the person reaches, each labelled with its project; deleting a project takes only its rows", { timeout: 120_000 }, async t => {
  const { f, host, open, call, risk, here } = await fixture(t);
  const second = await open("另一个项目");
  const a = await risk("供应商延期"), b = await second.risk("汇率波动");
  const save = (via: typeof call, cite: { kind: string; id: string }, why: string) => via<BriefSaved>(workBriefActions.save, { request_id: once(), draft: {
    claims: [{ text: "有一件事要定。", cites: [cite] }], attention: [{ subject: cite, why }], next: [{ text: "让助理跟进", why: "还没人跟", act: { kind: "assistant" } }] } });
  const first = await save(call, { kind: "risk", id: a.risk_id }, "要决定是否换供应商");
  await save(second.call, { kind: "risk", id: b.risk_id }, "要决定是否对冲");
  const me = person([...WORK_BRIEF_WRITE], null);
  const personal = () => host.homeActionClient().invoke(me, ref(workBriefPersonalActions.get), {}) as Promise<PersonalView>;
  const lines = (view: PersonalView) => view.items.map(item => [item.label, item.kind, item.project_id, item.text]).sort();
  const before = await personal();
  assert.equal(before.projects_complete, true);
  assert.deepEqual(lines(before), [
    ["project", "attention", here.project_id, "要决定是否换供应商"], ["project", "attention", second.here.project_id, "要决定是否对冲"],
    ["project", "next", here.project_id, "让助理跟进"], ["project", "next", second.here.project_id, "让助理跟进"]].sort());
  assert.ok(before.items.every(item => item.brief_id), "each line says which brief it is from, so the page can open it there");
  // A next step the person dealt with is no longer waiting.
  await call(workBriefActions.setNext, { brief_id: first.brief.brief_id, option_id: first.version!.next[0]!.option_id, state: "later" });
  assert.equal((await personal()).items.filter(item => item.kind === "next").length, 1);
  // Reading the personal brief starts nothing and saves nothing; a refresh reads the Home-level sources only.
  const refreshed = await host.homeActionClient().invoke(me, ref(workBriefPersonalActions.refresh), {}) as PersonalView & { changed: boolean };
  assert.equal(refreshed.items.filter(item => item.label === "project").length, 3);
  // Deleting one project removes its briefs and nothing of the other's.
  const deleted = await f.request(`/api/settings/projects/${here.project_id}/delete`, { method: "POST", body: { delete_confirmed: true, idempotency_key: "wb-delete" } });
  assert.equal(deleted.status, 200, await deleted.clone().text());
  const after = await personal();
  assert.deepEqual(lines(after), [["project", "attention", second.here.project_id, "要决定是否对冲"], ["project", "next", second.here.project_id, "让助理跟进"]].sort());
  assert.equal((await second.call<BriefView>(workBriefActions.get, {})).version!.claims.length, 1);
});
