import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AcceptanceReportInput, AcceptanceRequirementState, AcceptanceView } from "@molis-ai/molis-work-contracts/modules/acceptance";
import { openAcceptance, purgeAcceptanceProject, type AcceptanceCaller, type AcceptanceEvidencePorts } from "@molis-ai/molis-work-module-acceptance";

/*
 * Requirements, evidence and acceptance as a platform capability (specs/proactive-assistant §7.3.1, PWA-144～146; the shared review
 * shapes of specs/agent-approval §3.5, APR-14). The object is any provider's — here an Assistant task — and nothing in this file,
 * or in `modules/acceptance`, knows Goals (APR-15).
 */

const SUBJECT = { provider_id: "io.molis.work.assistant.rules", subject: { kind: "assistant.work", id: "w1" } };
const agent = (session: string | null = "s-maker", project = "p1"): AcceptanceCaller => ({ project_id: project, actor_id: "agent:assistant", person: false, session });
const me = (project = "p1"): AcceptanceCaller => ({ project_id: project, actor_id: "person", person: true, session: null });
const code = (expected: string) => (error: unknown) => error instanceof ActionError && error.code === expected;
const receipt = (call_id: string, run_id = "run-3") => ({ kind: "command_receipt" as const, run_id, call_id });
const ok = { recorded: true, exit_code: 0, timed_out: false, cancelled: false, changed_after: false };

/** The Agent Host and the 成果库 as the platform would answer: rounds by session, commands by call id, versions that can be read. */
function platform(sessions: Record<string, string[]>, commands: Record<string, Partial<typeof ok>> = {}, readable: string[] = []) {
  const asked: string[] = [];
  const ports = (caller: AcceptanceCaller): AcceptanceEvidencePorts => ({
    artifactReadable: async reference => { if (reference.artifact_id === "broken") throw new Error("store down"); return readable.includes(`${reference.artifact_id}@${reference.version}`); },
    checkRun: async (runId, callIds) => {
      asked.push(`${caller.session}:${runId}:${callIds.join(",")}`);
      if (!caller.session || !sessions[caller.session]?.includes(runId)) return "none";
      return { commands: callIds.map(call_id => ({ call_id, ...ok, ...(call_id in commands ? commands[call_id] : { recorded: false }) })) };
    },
    stopped: () => false,
  });
  return { ports, asked };
}

function rig(t: TestContext) {
  const home = mkdtempSync(join(tmpdir(), "acceptance-"));
  let tick = 0;
  const { service, close } = openAcceptance(home, () => new Date(Date.UTC(2026, 10, 15, 8, 0, tick++)).toISOString());
  t.after(() => { close(); rmSync(home, { recursive: true, force: true }); });
  const readOne = (caller: AcceptanceCaller, subject: typeof SUBJECT) => service.read(caller, { subjects: [subject] }).views[0]!;
  return { home, service, readOne };
}
const item = (view: AcceptanceView, id: string): AcceptanceRequirementState => view.requirements.find(one => one.id === id)!;
const report = (requirement_id: string, version: string, extra: Partial<AcceptanceReportInput> = {}): AcceptanceReportInput =>
  ({ requirement_id, verdict: "supports", checked: { version }, method: "对照截图", observed: "符合", ...extra });
const SIX = [
  { id: "r1", statement: "三档并排，三种宽度都不掉行", part: "三档价格表", requires_person: false },
  { id: "r2", statement: "企业版写「联系我们」", part: "企业版一栏", requires_person: false },
  { id: "r3", statement: "发布前给你看一眼", part: "整页预览", requires_person: true },
  { id: "r4", statement: "价格与 11 月报价单一致", part: "价格数字", requires_person: false },
  { id: "r5", statement: "390 宽时按钮够大", part: "手机版按钮", requires_person: false },
  { id: "r6", statement: "页脚链接都能打开", part: "页脚", requires_person: false },
];

/** v2 then v3 delivered (v3 made in run-3 of the maker's session), with the six requirements reported the way the specimen shows them. */
async function delivered(t: TestContext) {
  const { home, service, readOne } = rig(t);
  const world = platform({ "s-maker": ["run-3"], "s-other": ["run-9"] }, { c1: {}, c3: {}, cfail: { exit_code: 1 }, clate: { changed_after: true }, ctime: { timed_out: true } }, ["shot@1"]);
  service.set(agent(), { subject: SUBJECT, requirements: SIX });
  await service.deliver(agent(), { subject: SUBJECT, version: "v2" }, world.ports(agent()));
  await service.deliver(agent(), { subject: SUBJECT, version: "v3", touches: SIX.map(one => one.id), made_in: { run_id: "run-3" }, summary: "改成三档" }, world.ports(agent()));
  return { home, service, world, readOne };
}

test("PWA-144 APR-14 each requirement shows what was checked, on which version, how and with what evidence; self-report alone, missing evidence, evidence of an earlier version and evidence of another object are saved and never pass, and the work being done hides none of them", async t => {
  const { service, world, readOne } = await delivered(t);
  const view = await service.report(agent(), { subject: SUBJECT, reports: [
    report("r1", "v3", { evidence: [receipt("c1"), { kind: "artifact_version", artifact_id: "shot", version: 1 }], method: "三种宽度截图比对" }),
    report("r2", "v3", { method: "执行者说明", observed: "已按决定改" }),
    report("r3", "v3", { evidence: [receipt("c3")] }),
    report("r4", "v2", { evidence: [receipt("c1")], method: "对过报价单" }),
    report("r5", "v3", { checked: { version: "v3", subject: { kind: "page", id: "home" } }, evidence: [receipt("c1")] }),
  ] }, world.ports(agent()));

  assert.equal(view.version, "v3"); assert.equal(view.round, 2);
  const r1 = item(view, "r1");
  assert.deepEqual([r1.verified, r1.gap, r1.check?.tier, r1.check?.checked_version, r1.check?.method, r1.stands_on, r1.part], [true, null, "machine_checked", "v3", "三种宽度截图比对", "v3", "三档价格表"]);
  assert.deepEqual(r1.check?.evidence, [receipt("c1"), { kind: "artifact_version", artifact_id: "shot", version: 1 }]);
  assert.deepEqual([r1.person, r1.satisfied], ["not_needed", true], "a requirement that does not need the person is satisfied by a machine check");
  // The four gaps: each keeps its report, none passes, and each is the person's to accept or return.
  assert.deepEqual(["r2", "r4", "r5", "r6"].map(id => [item(view, id).gap, item(view, id).verified, item(view, id).satisfied, item(view, id).person]),
    [["self_only", false, false, "pending"], ["evidence_stale", false, false, "pending"], ["wrong_object", false, false, "pending"], ["evidence_missing", false, false, "pending"]]);
  assert.deepEqual([item(view, "r2").check?.tier, item(view, "r4").check?.checked_version, item(view, "r5").check?.tier, item(view, "r6").check], ["self_reported", "v2", "self_reported", null]);
  // Machine-checked but the person's: verified, not satisfied.
  assert.deepEqual([item(view, "r3").verified, item(view, "r3").person, item(view, "r3").satisfied], [true, "pending", false]);
  assert.deepEqual(view.counts, { total: 6, verified: 2, needs_person: 5, accepted: 0, satisfied: 1 });
  assert.equal(view.complete, false, "two deliveries and a full round of reports do not make it complete");

  // What cannot be established stays the reporter's word, with what was missing; the reporter cannot state its own tier.
  const weigh = async (extra: Partial<AcceptanceReportInput>, caller = agent()) => item(await service.report(caller, { subject: SUBJECT, reports: [report("r6", "v3", extra)] }, world.ports(caller)), "r6");
  assert.deepEqual([(await weigh({ evidence: [receipt("cfail")] })).gap, (await weigh({ evidence: [receipt("ctime")] })).gap], ["check_failed", "check_failed"]);
  assert.equal((await weigh({ evidence: [receipt("clate")] })).gap, "wrong_object", "the round wrote again after the command ran");
  assert.equal((await weigh({ evidence: [receipt("never")] })).gap, "evidence_missing", "no receipt under that id");
  assert.equal((await weigh({ evidence: [receipt("c1", "run-9")] })).gap, "wrong_object", "a command of another round");
  assert.equal((await weigh({ evidence: [receipt("c1")] }, agent("s-other"))).gap, "wrong_object", "another session did not make this version");
  assert.equal((await weigh({ evidence: [receipt("c1")] }, agent(null))).gap, "evidence_missing", "a caller the Host bound to no session");
  assert.equal((await weigh({ evidence: [{ kind: "artifact_version", artifact_id: "gone", version: 1 }, receipt("c1")] })).gap, "evidence_unreadable");
  assert.equal((await weigh({ evidence: [{ kind: "artifact_version", artifact_id: "broken", version: 1 }] })).gap, "evidence_unreadable", "a lookup that fails is evidence that could not be read");
  assert.deepEqual([(await weigh({ evidence: [{ kind: "artifact_version", artifact_id: "shot", version: 1 }] })).gap, item(await readOne(me(), SUBJECT), "r6").check?.tier], ["self_only", "self_reported"],
    "a readable picture is still the reporter's own word");
  assert.equal((await weigh({ checked: { version: "v9" } })).gap, "wrong_object", "a version that was never delivered");
  const forged = await weigh({ ...({ tier: "machine_checked", gap: null } as object) });
  assert.deepEqual([forged.verified, forged.check?.tier], [false, "self_reported"], "a tier written into the report is not read");
  assert.equal((await weigh({ verdict: "contradicts", evidence: [receipt("c1")] })).gap, "contradicted");
  // The earlier reports are all still there.
  assert.equal(item(await readOne(me(), SUBJECT), "r6").history.filter(entry => entry.type === "check").length, 13);

  await assert.rejects(service.report(agent(), { subject: SUBJECT, reports: [report("nope", "v3")] }, world.ports(agent())), code("acceptance.requirement_unknown"));
  await assert.rejects(service.report(agent(), { subject: { ...SUBJECT, subject: { kind: "assistant.work", id: "w2" } }, reports: [report("r1", "v3")] }, world.ports(agent())), code("acceptance.subject_unknown"));
});

test("PWA-145 that the work ran, what was verified and what the person accepted are three separate readings; engineering evidence and trying the product stand apart; the person is asked only where it was agreed or where the check has a gap; only the person decides", async t => {
  const { service, readOne } = rig(t);
  const world = platform({ "s-maker": ["run-1"] }, { build: {}, tried: {} });
  const subject = SUBJECT, ports = world.ports(agent());
  service.set(agent(), { subject, requirements: [{ id: "a", statement: "构建通过", requires_person: false }, { id: "b", statement: "新手引导走得通", requires_person: true }, { id: "c", statement: "文案无错字", requires_person: false }] });
  const before = readOne(me(), subject);
  assert.deepEqual([before.version, before.round, before.counts.verified, before.complete], [null, 0, 0, false]);
  assert.deepEqual(before.requirements.map(one => [one.person, one.gap, one.satisfied]), [["not_needed", null, false], ["pending", null, false], ["not_needed", null, false]], "nothing is asked of the person before there is something to look at");

  // Delivered: execution is done, and that is all.
  const shipped = await service.deliver(agent(), { subject, version: "build-12", made_in: { run_id: "run-1" } }, ports);
  assert.deepEqual([shipped.version, shipped.counts.verified, shipped.counts.accepted, shipped.counts.satisfied, shipped.complete], ["build-12", 0, 0, 0, false]);

  const checked = await service.report(agent(), { subject, reports: [
    report("a", "build-12", { evidence: [receipt("build", "run-1")], method: "pnpm build" }),
    report("b", "build-12", { evidence: [receipt("build", "run-1")], method: "pnpm test" }),
    report("b", "build-12", { kind: "hands_on", method: "在预览里从头走了一遍", observed: "三步都能过" }),
  ] }, ports);
  const a = item(checked, "a"), b = item(checked, "b"), c = item(checked, "c");
  assert.deepEqual([a.verified, a.person, a.satisfied], [true, "not_needed", true], "no approval gate is added where none was agreed");
  assert.deepEqual([b.check?.kind, b.check?.tier, b.hands_on?.kind, b.hands_on?.tier, b.hands_on?.method], ["engineering", "machine_checked", "hands_on", "self_reported", "在预览里从头走了一遍"], "engineering evidence and the hands-on try are kept apart");
  assert.deepEqual([b.verified, b.person, b.satisfied], [true, "pending", false], "neither stands for the person's acceptance");
  assert.deepEqual([c.gap, c.person, c.satisfied], ["evidence_missing", "pending", false]);
  assert.deepEqual(checked.counts, { total: 3, verified: 2, needs_person: 2, accepted: 0, satisfied: 1 });

  // The refusal: an Agent, however it is asked, cannot accept; nothing is written.
  assert.throws(() => service.decide(agent(), { subject, version: "build-12", accepts: [{ id: "b", version: 1 }], returns: [] }), code("acceptance.scope"));
  assert.equal(item(readOne(me(), subject), "b").decision, null);

  // The person accepts the one that waits on them; the unrelated gap still blocks only itself.
  const accepted = service.decide(me(), { subject, version: "build-12", accepts: [{ id: "b", version: 1 }], returns: [] });
  assert.deepEqual([item(accepted, "b").person, item(accepted, "b").satisfied, item(accepted, "b").decision?.actor_id, item(accepted, "b").decision?.version], ["accepted", true, "person", "build-12"]);
  assert.deepEqual([accepted.counts.accepted, accepted.counts.satisfied, accepted.complete], [1, 2, false]);
  // A hands-on try that contradicts overrides a green build for that requirement only.
  const tried = await service.report(agent(), { subject, reports: [report("a", "build-12", { kind: "hands_on", verdict: "contradicts", method: "点了构建产物", observed: "白屏" })] }, ports);
  assert.deepEqual([item(tried, "a").verified, item(tried, "a").gap, item(tried, "a").satisfied, item(tried, "b").satisfied], [false, "contradicted", false, true]);
});

test("PWA-146 rework keeps every round: what was accepted and not touched stays accepted, only the returned and the changed are checked again, a gap is not closed by delivering again, a changed requirement is recorded apart from the fix, and a selection that moved is not applied", async t => {
  const { service, world, readOne } = await delivered(t);
  const ports = world.ports(agent());
  await service.report(agent(), { subject: SUBJECT, reports: [report("r1", "v3", { evidence: [receipt("c1")] }), report("r2", "v3"), report("r3", "v3", { evidence: [receipt("c3")] }), report("r4", "v2", { evidence: [receipt("c1")] })] }, ports);

  // One decision: r3 accepted, r2 returned with why. The rest are not in it and do not move.
  await assert.rejects(async () => service.decide(me(), { subject: SUBJECT, version: "v3", accepts: [], returns: [{ id: "r2", version: 1, note: "  " }] }), code("acceptance.note_required"));
  const decided = service.decide(me(), { subject: SUBJECT, version: "v3", accepts: [{ id: "r3", version: 1 }], returns: [{ id: "r2", version: 1, note: "企业版还写着价格" }] });
  assert.equal(item(decided, "r3").decision?.decision_id, item(decided, "r2").decision?.decision_id, "one decision covers both");
  assert.deepEqual([item(decided, "r2").person, item(decided, "r2").recheck, item(decided, "r2").decision?.note, item(decided, "r2").satisfied], ["returned", "returned", "企业版还写着价格", false]);
  assert.deepEqual([item(decided, "r4").person, item(decided, "r5").person], ["pending", "pending"]);

  // The person changes what r5 asks: a new version of the requirement, recorded as such; the executor may not.
  assert.throws(() => service.set(agent(), { subject: SUBJECT, requirements: SIX.map(one => one.id === "r2" ? { ...one, statement: "企业版随便写" } : one) }), code("acceptance.requirements_fixed"));
  const changed = service.set(me(), { subject: SUBJECT, requirements: SIX.map(one => one.id === "r5" ? { ...one, statement: "390 宽时按钮不小于 44" } : one) });
  assert.deepEqual([item(changed, "r5").version, item(changed, "r5").statement, item(changed, "r3").version, item(changed, "r3").person], [2, "390 宽时按钮不小于 44", 1, "accepted"], "only the changed requirement gets a new version");

  // A selection frozen before the change is not applied, whole: the delivered version or a requirement moved.
  const untouched = JSON.stringify(readOne(me(), SUBJECT));
  assert.throws(() => service.decide(me(), { subject: SUBJECT, version: "v3", accepts: [{ id: "r1", version: 1 }, { id: "r5", version: 1 }], returns: [] }), code("acceptance.selection_changed"));
  assert.throws(() => service.decide(me(), { subject: SUBJECT, version: "v2", accepts: [{ id: "r1", version: 1 }], returns: [] }), code("acceptance.selection_changed"));
  assert.equal(JSON.stringify(readOne(me(), SUBJECT)), untouched, "a refused selection writes nothing, not even its unaffected items");

  // Rework comes back as v4 and says what it touched. Delivering closes nothing.
  await assert.rejects(service.deliver(agent(), { subject: SUBJECT, version: "v4" }, ports), code("acceptance.invalid"), "a later delivery must say what it touched");
  await assert.rejects(service.deliver(agent(), { subject: SUBJECT, version: "v4", touches: ["r9"] }, ports), code("acceptance.requirement_unknown"));
  const v4 = await service.deliver(agent(), { subject: SUBJECT, version: "v4", touches: ["r2", "r5"], summary: "企业版改成联系我们；按钮加大", made_in: { run_id: "run-3" } }, ports);
  assert.deepEqual(v4.changes, { summary: "企业版改成联系我们；按钮加大", touched: ["r2", "r5"] });
  assert.deepEqual(["r1", "r3", "r2", "r5"].map(id => [item(v4, id).stands_on, item(v4, id).carried]), [["v3", true], ["v3", true], ["v4", false], ["v4", false]]);
  assert.deepEqual([item(v4, "r1").verified, item(v4, "r1").satisfied, item(v4, "r3").person, item(v4, "r3").satisfied], [true, true, "accepted", true], "the accepted and the verified that were not touched are kept, without asking again");
  assert.deepEqual([item(v4, "r2").person, item(v4, "r2").recheck, item(v4, "r2").gap, item(v4, "r2").satisfied], ["pending", null, "evidence_stale", false], "the returned one waits for a check of the new version");
  assert.deepEqual([item(v4, "r5").gap, item(v4, "r5").satisfied], ["evidence_missing", false]);
  // Not touched and never passed: carried over as the gap it was, not as done.
  assert.deepEqual([item(v4, "r4").carried, item(v4, "r4").gap, item(v4, "r4").satisfied, item(v4, "r6").gap, item(v4, "r6").satisfied], [true, "evidence_stale", false, "evidence_missing", false]);
  assert.equal(v4.complete, false);

  // Only the two touched are checked again; then the person accepts on v4.
  const rechecked = await service.report(agent(), { subject: SUBJECT, reports: [report("r2", "v4", { evidence: [receipt("c1")] }), report("r5", "v4", { evidence: [receipt("c1")] })] }, ports);
  assert.deepEqual([item(rechecked, "r2").verified, item(rechecked, "r2").check?.checked_version, item(rechecked, "r5").verified, item(rechecked, "r5").check?.requirement_version], [true, "v4", true, 2]);
  const done = service.decide(me(), { subject: SUBJECT, version: "v4", accepts: [{ id: "r2", version: 1 }, { id: "r4", version: 1 }, { id: "r6", version: 1 }], returns: [] });
  assert.deepEqual([done.complete, done.counts.satisfied, item(done, "r4").decision?.version, item(done, "r2").decision?.version], [true, 6, "v3", "v4"], "an accepted item is recorded against the version it stands on");
  // Every round is still readable, in order, on the item itself.
  assert.deepEqual(item(done, "r2").history.map(entry => entry.type === "check" ? `check ${entry.checked_version} ${entry.tier}` : entry.type === "decision" ? `${entry.decision} ${entry.version}` : entry.type === "delivery" ? `delivery ${entry.version}${entry.touched ? "" : " untouched"}` : `requirement v${entry.requirement_version}`),
    ["requirement v1", "delivery v2", "delivery v3", "check v3 self_reported", "returned v3", "delivery v4", "check v4 machine_checked", "accepted v4"]);
  assert.deepEqual(item(done, "r5").history.filter(entry => entry.type === "requirement").map(entry => entry.type === "requirement" && [entry.requirement_version, entry.by_person]), [[1, false], [2, true]]);
  assert.ok(item(done, "r1").history.some(entry => entry.type === "delivery" && entry.version === "v4" && !entry.touched));
});

test("PWA-144 APR-15 the record is the project's and goes with it: the same object in another project has nothing, a withdrawn requirement leaves the list and keeps its record, and deleting the project clears only that project", async t => {
  const { home, service, readOne } = rig(t);
  const world = platform({ "s-maker": ["run-1"] });
  service.set(agent(), { subject: SUBJECT, requirements: SIX.slice(0, 2) });
  service.set(agent("s-maker", "p2"), { subject: SUBJECT, requirements: SIX.slice(0, 3) });
  assert.deepEqual([readOne(me(), SUBJECT).requirements.length, readOne(me("p2"), SUBJECT).requirements.length, readOne(me("p3"), SUBJECT).requirements.length], [2, 3, 0]);
  // One read answers for several objects, in the order asked, an object with nothing hung on it as an empty view: a page reads all its cards at once.
  const OTHER = { provider_id: SUBJECT.provider_id, subject: { kind: "assistant.work", id: "w2" } };
  assert.deepEqual(service.read(me(), { subjects: [OTHER, SUBJECT] }).views.map(view => [view.subject.subject.id, view.requirements.length]), [["w2", 0], ["w1", 2]]);
  assert.deepEqual(service.set(agent(), { subject: SUBJECT, requirements: [SIX[1]!, { ...SIX[0]!, id: "r7" }] }).requirements.map(one => [one.id, one.version]), [["r2", 1], ["r7", 1]], "r1 is withdrawn, r2 is unchanged");
  assert.throws(() => service.set(agent(), { subject: SUBJECT, requirements: [SIX[0]!, SIX[0]!] }), code("acceptance.invalid"));
  assert.throws(() => readOne({ ...me(), project_id: "p1" }, { provider_id: " ", subject: { kind: "k", id: "i" } }), code("acceptance.scope"));
  await service.deliver(agent(), { subject: SUBJECT, version: "v1" }, world.ports(agent()));
  await assert.rejects(service.deliver(agent(), { subject: SUBJECT, version: "v1", touches: [] }, world.ports(agent())), code("acceptance.invalid"), "a version is delivered once");
  await assert.rejects(service.report(agent("s-maker", "p2"), { subject: SUBJECT, reports: [report("r1", "v1")] }, world.ports(agent())), code("acceptance.version_unknown"), "nothing delivered in the other project");

  purgeAcceptanceProject(home, "p1");
  assert.deepEqual([readOne(me(), SUBJECT).requirements.length, readOne(me("p2"), SUBJECT).requirements.length], [0, 3]);
  purgeAcceptanceProject(home, "p1");
});
