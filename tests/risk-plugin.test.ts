import assert from "node:assert/strict";
import test from "node:test";
import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { RISK_READ, RISK_WRITE, riskActions, riskPresentationActions, riskReviewActions, riskSearchActions, toRiskReview, type RiskRecord, type RiskReview } from "@molis-ai/molis-work-plugin-risk";
import { person, serveHomeRuntime } from "./fixtures/home-runtime.js";

const ref = (definition: { capability_id: string; version: number }) => ({ capability_id: definition.capability_id, version: definition.version });
const code = async (operation: Promise<unknown>) => { try { await operation; return "accepted"; } catch (error) { return error instanceof ActionError ? error.code : String(error); } };

async function fixture(t: Parameters<typeof serveHomeRuntime>[0]) {
  const f = await serveHomeRuntime(t), { host } = f;
  const here = await f.project("风险项目");
  // A new project does not carry Risk; the person adds it in the project's plugin settings.
  const index = await f.request("/api/settings/project-plugins");
  const { projects } = await index.json() as { projects: Array<{ project_id: string; revision: string }> };
  const revision = projects.find(row => row.project_id === here.project_id)!.revision;
  const added = await f.request(`/api/settings/projects/${encodeURIComponent(here.project_id)}/plugins`, { method: "POST", body: { plugin_id: "risk", expected_revision: revision } });
  assert.equal(added.status, 200, await added.clone().text());
  const client = host.actionClient(here.reference);
  const caller: ActionCallContext = person([...RISK_WRITE], here.project_id);
  const call = <O>(definition: { capability_id: string; version: number }, input: unknown, who: ActionCallContext = caller) => client.invoke(who, ref(definition), input) as Promise<O>;
  return { here, call, caller };
}

test("RISK-01 RISK-02 a risk is recorded, read back with its history, changed at the revision read, and closed", { timeout: 60_000 }, async t => {
  const { call } = await fixture(t);
  const { risk } = await call<{ risk: RiskRecord }>(riskActions.create, { title: " 供应商延期 ", statement: "交付可能晚两周", impact: "high", likelihood: "medium", owner_name: "小李" });
  assert.equal(risk.title, "供应商延期");
  assert.equal(risk.status, "open");
  assert.equal(risk.revision, 1);
  assert.equal(risk.treatment, "");
  const updated = await call<{ risk: RiskRecord }>(riskActions.update, { risk_id: risk.risk_id, expected_revision: 1, treatment: "找备选供应商" });
  assert.equal(updated.risk.revision, 2);
  // Stale revision: refused with the current record, nothing overwritten.
  const stale = await call(riskActions.update, { risk_id: risk.risk_id, expected_revision: 1, treatment: "覆盖" }).catch((error: ActionError) => error);
  assert.ok(stale instanceof ActionError);
  assert.equal(stale.code, "risk.conflict");
  assert.equal((stale.details as { current: RiskRecord }).current.treatment, "找备选供应商");
  await call(riskActions.addNote, { risk_id: risk.risk_id, text: "已联系备选" });
  const closed = await call<{ risk: RiskRecord }>(riskActions.setStatus, { risk_id: risk.risk_id, expected_revision: 3, status: "closed", note: "已按期交付" });
  assert.equal(closed.risk.status, "closed");
  assert.ok(closed.risk.closed_at);
  assert.equal(await code(call(riskActions.update, { risk_id: risk.risk_id, expected_revision: 4, title: "改" })), "risk.closed");
  const read = await call<{ events: Array<{ kind: string; detail: Record<string, unknown> }> }>(riskActions.get, { risk_id: risk.risk_id });
  assert.deepEqual(read.events.map(event => event.kind), ["status", "note", "updated", "created"]);
  assert.deepEqual(read.events[0]!.detail, { status: "closed", previous_status: "open", text: "已按期交付" }, "values and the person's words, no translated sentence");
  assert.deepEqual(read.events[2]!.detail, { fields: ["treatment"] });
  assert.equal(await code(call(riskActions.get, { risk_id: "risk-missing" })), "risk.not_found");
});

test("RISK-02 the overview lists open risks by default, filters, and pages by cursor", { timeout: 60_000 }, async t => {
  const { call } = await fixture(t);
  const made: RiskRecord[] = [];
  for (const [title, impact] of [["一", "high"], ["二", "low"], ["三", "high"]] as const) {
    made.push((await call<{ risk: RiskRecord }>(riskActions.create, { title, statement: "s", impact, likelihood: "low", owner_name: title === "二" ? "小王" : null })).risk);
  }
  await call(riskActions.setStatus, { risk_id: made[1]!.risk_id, expected_revision: 1, status: "closed" });
  type Page = { risks: Array<RiskRecord & { links: unknown[] }>; owners: string[]; next_cursor: string | null };
  const open = await call<Page>(riskActions.list, {});
  assert.deepEqual(open.risks.map(risk => risk.title).sort(), ["一", "三"]);
  assert.deepEqual(open.owners, ["小王"]);
  assert.deepEqual((await call<Page>(riskActions.list, { status: "closed" })).risks.map(risk => risk.title), ["二"]);
  assert.equal((await call<Page>(riskActions.list, { status: "all", impact: "high" })).risks.length, 2);
  const first = await call<Page>(riskActions.list, { status: "all", limit: 2 });
  assert.equal(first.risks.length, 2);
  assert.ok(first.next_cursor);
  const second = await call<Page>(riskActions.list, { status: "all", limit: 2, cursor: first.next_cursor });
  assert.equal(second.risks.length, 1);
  assert.equal(second.next_cursor, null);
  assert.deepEqual(new Set([...first.risks, ...second.risks].map(risk => risk.title)), new Set(["一", "二", "三"]));
  assert.equal(await code(call(riskActions.list, { cursor: "not-a-cursor" })), "risk.invalid");
  assert.equal(await code(call(riskActions.list, { limit: 201 })), "actions.input_invalid");
});

test("RISK-03 a risk links an object only through its owner's reader, and never itself", { timeout: 60_000 }, async t => {
  const { call } = await fixture(t);
  const a = (await call<{ risk: RiskRecord }>(riskActions.create, { title: "甲", statement: "s", impact: "medium", likelihood: "medium" })).risk;
  const b = (await call<{ risk: RiskRecord }>(riskActions.create, { title: "乙", statement: "s", impact: "low", likelihood: "low" })).risk;
  const linked = await call<{ links: Array<{ subject: { kind: string; id: string } }> }>(riskActions.addLink, { risk_id: a.risk_id, subject: { kind: "risk", id: b.risk_id } });
  assert.deepEqual(linked.links.map(link => link.subject), [{ kind: "risk", id: b.risk_id }]);
  await call(riskActions.addLink, { risk_id: a.risk_id, subject: { kind: "risk", id: b.risk_id } });
  assert.equal((await call<{ links: unknown[] }>(riskActions.get, { risk_id: a.risk_id })).links.length, 1, "linking twice keeps one");
  assert.equal(await code(call(riskActions.addLink, { risk_id: a.risk_id, subject: { kind: "risk", id: a.risk_id } })), "risk.invalid");
  assert.equal(await code(call(riskActions.addLink, { risk_id: a.risk_id, subject: { kind: "risk", id: "risk-gone" } })), "risk.invalid", "an object its reader does not find is not linked");
  const removed = await call<{ links: unknown[] }>(riskActions.removeLink, { risk_id: a.risk_id, subject: { kind: "risk", id: b.risk_id } });
  assert.deepEqual(removed.links, []);
});

test("RISK-05 other plugins read risks through the public source: reader, search and presentation", { timeout: 60_000 }, async t => {
  const { call, here } = await fixture(t);
  const risk = (await call<{ risk: RiskRecord }>(riskActions.create, { title: "上线延期", statement: "依赖的接口未就绪", impact: "high", likelihood: "high" })).risk;
  const reader = person([...RISK_READ], here.project_id);
  const context = await call<{ title: string; content: string; open: { surface: string; id: string } }>(riskSearchActions.subject, { subject_id: risk.risk_id }, reader);
  assert.equal(context.title, "上线延期");
  assert.match(context.content, /依赖的接口未就绪/);
  assert.deepEqual(context.open, { surface: "risk", id: risk.risk_id });
  const entries = await call<{ entries: Array<{ subject: { id: string } }> }>(riskSearchActions.entries, { cursor: null, limit: 50 }, reader);
  assert.deepEqual(entries.entries.map(entry => entry.subject.id), [risk.risk_id]);
  const [values, overview] = riskPresentationActions;
  const shown = await call<{ items: Array<{ state: string; values?: Record<string, unknown> }> }>(values!, { subjects: [{ kind: "risk", id: risk.risk_id }, { kind: "risk", id: "risk-gone" }], fields: ["title", "status", "severity"] }, reader);
  assert.equal(shown.items[0]!.state, "ok");
  assert.deepEqual(shown.items[0]!.values?.severity, { key: "risk.presentation.severity-high" });
  assert.equal(shown.items[1]!.state, "deleted");
  const home = await call<{ subjects: unknown[] }>(overview!, {}, reader);
  assert.deepEqual(home.subjects, [{ kind: "risk", id: risk.risk_id }]);
  assert.equal(await code(call(riskActions.create, { title: "x", statement: "s", impact: "low", likelihood: "low" }, reader)), "actions.forbidden", "reading does not let one write");
});

test("RISK-07 a risk's review is a one-off Schedule task about it: scheduled, moved, paused, read with its grant state, cancelled, and archived on close", { timeout: 60_000 }, async t => {
  const { call, here } = await fixture(t);
  const scheduler = person([...RISK_WRITE, "schedule:read", "schedule:write"], here.project_id);
  const as = <O>(definition: { capability_id: string; version: number }, input: unknown) => call<O>(definition, input, scheduler);
  const { risk } = await as<{ risk: RiskRecord }>(riskActions.create, { title: "供应商延期", statement: "交付可能晚两周", impact: "high", likelihood: "medium" });
  assert.deepEqual(await as(riskReviewActions.get, { risk_id: risk.risk_id }), { state: "ok", review: null });
  assert.deepEqual(await call(riskReviewActions.get, { risk_id: risk.risk_id }), { state: "unavailable", review: null },
    "a caller who cannot reach Schedule sees the review section say so, not a failed detail");

  const at = new Date(Date.now() + 3_600_000).toISOString();
  const { review } = await as<{ review: RiskReview }>(riskReviewActions.schedule, { risk_id: risk.risk_id, at, focus: "看备选供应商回复了没有" });
  assert.equal(review.state, "scheduled");
  assert.equal(review.at, at);
  assert.equal(review.focus, "看备选供应商回复了没有");
  assert.equal(review.result, null);
  assert.deepEqual(review.reads, { categories: 0, granted: 0, needs_confirmation: 0, unavailable: 0, removed: 0 },
    "no read grant yet: the round would not read the risk, and the detail says so");

  const later = new Date(Date.now() + 7_200_000).toISOString();
  const moved = await as<{ review: RiskReview }>(riskReviewActions.schedule, { risk_id: risk.risk_id, at: later });
  assert.equal(moved.review.task_id, review.task_id, "moving a review changes the one task, never a second one");
  assert.equal(moved.review.at, later);
  assert.equal(moved.review.focus, "交付可能晚两周", "without a focus the round looks at the risk's own statement");

  assert.equal((await as<{ review: RiskReview }>(riskReviewActions.enabled, { risk_id: risk.risk_id, enabled: false })).review.state, "paused");
  assert.equal((await as<{ review: RiskReview }>(riskReviewActions.enabled, { risk_id: risk.risk_id, enabled: true })).review.state, "scheduled");
  assert.equal(await code(as(riskReviewActions.schedule, { risk_id: risk.risk_id, at: new Date(Date.now() - 60_000).toISOString() })), "schedule.task_invalid");
  // Without Schedule's own permissions the caller cannot reach the review through the risk either: the directory does not show it
  // Schedule at all, so the risk says the review is unavailable rather than reaching around the caller.
  assert.equal(await code(call(riskReviewActions.schedule, { risk_id: risk.risk_id, at })), "risk.review_unavailable");

  assert.deepEqual(await as(riskReviewActions.cancel, { risk_id: risk.risk_id }), { cancelled: true });
  assert.deepEqual(await as(riskReviewActions.get, { risk_id: risk.risk_id }), { state: "ok", review: null });
  assert.deepEqual(await as(riskReviewActions.cancel, { risk_id: risk.risk_id }), { cancelled: false });

  await as(riskReviewActions.schedule, { risk_id: risk.risk_id, at });
  const closed = await as<{ risk: RiskRecord; review_left?: unknown }>(riskActions.setStatus, { risk_id: risk.risk_id, expected_revision: risk.revision, status: "closed" });
  assert.equal(closed.risk.status, "closed");
  assert.equal(closed.review_left, undefined);
  assert.deepEqual(await as(riskReviewActions.get, { risk_id: risk.risk_id }), { state: "ok", review: null }, "closing a risk archives its review");
  assert.equal(await code(as(riskReviewActions.schedule, { risk_id: risk.risk_id, at })), "risk.closed");
});

test("RISK-08 a review that found nothing new, one that failed, and one paused before its time read as three different states", () => {
  const base = { task_id: "t", title: "供应商延期", instructions: "看", run_at: "2026-11-01T01:00:00.000Z", last_error: null };
  const now = Date.parse("2026-11-02T00:00:00.000Z");
  const quiet = toRiskReview({ ...base, enabled: false, last_run_at: "2026-11-01T01:00:05.000Z",
    turns: [{ kind: "user", text: "看", important: false, created_at: "x" }, { kind: "assistant", text: "没有变化。", important: false, created_at: "y" }] }, [], now);
  assert.equal(quiet.state, "done");
  assert.deepEqual(quiet.result, { text: "没有变化。", important: false, at: "y" });
  assert.equal(quiet.failure, null);
  const failed = toRiskReview({ ...base, enabled: false, last_run_at: null, last_error: "模型没接上",
    turns: [{ kind: "user", text: "看", important: false, created_at: "x" }, { kind: "system", text: "到点了，但这一轮没跑成：模型没接上", important: false, created_at: "y" }] }, null, now);
  assert.equal(failed.state, "done");
  assert.equal(failed.result, null);
  assert.match(failed.failure ?? "", /没跑成/);
  assert.equal(failed.reads, null, "the platform could not say what it may read: unknown, not none");
  const paused = toRiskReview({ ...base, run_at: "2026-11-03T01:00:00.000Z", enabled: false, last_run_at: null, turns: [] }, [], now);
  assert.equal(paused.state, "paused");
});
