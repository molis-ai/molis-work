import assert from "node:assert/strict";
import test from "node:test";
import type { AgentTurnView } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentQueuedInput, AgentTurnSteer } from "@molis-ai/molis-work-contracts/services/agent-inputs";
import type { AssistantActivity, AssistantWorkObject, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { EN } from "@molis-ai/molis-work-app-workbench";
import { assistantOutcomeSteps, assistantStepRow, deliveryNote, deliveryNoteHtml, deliverySteps, drawAssistantReply, isOpenable } from "@molis-ai/molis-work-app-local-host";

// specs/ai-input-receipts §9.2, stage 3e-2a: the work's delivery note. The Host draws it from the records the view already
// carries: the runtime's ledger for the person's supplements, the AI's own statement kept apart, the round's activity, the
// sub-tasks, the `result` edges and the session's queue. `say` stands in for the request's translation.
const say = (text: string, values?: Record<string, string | number>) => Object.entries(values ?? {}).reduce((out, [key, value]) => out.replaceAll(`{${key}}`, String(value)), text);

const steer = (id: string, state: AgentTurnSteer["state"], extra: Partial<AgentTurnSteer> = {}): AgentTurnSteer => ({ id, state, ...extra });
const turn = (id: string, text: string, steered?: AgentTurnSteer, kind: AgentTurnView["kind"] = "user"): AgentTurnView => ({ turn_id: id, kind, text, at: null, ...(steered ? { steer: steered } : {}) });
const result = (id: string, title: string, extra: Partial<AssistantWorkObject> = {}): AssistantWorkObject => ({ relation: "result", open: { surface: "pages", id }, state: "current", subject: { kind: "page", id }, title,
  recorded_revision: null, current_revision: null, recorded_at: "2026-10-19T00:00:00.000Z", ...extra });
const round = (phase: string, turns: AgentTurnView[] = [], activity: AssistantActivity[] = [], run = "run-1") =>
  ({ run_id: run, text: "整理周报", phase, awaiting_input: [], turns, activity, materials: [], context: null, started_at: "", ended_at: null } as AssistantWorkView["rounds"][number]);
const view = (phase: string, turns: AgentTurnView[] = [turn("t1", "再加上第三季度的数字", steer("s1", "read"))], extra: Partial<AssistantWorkView> = {}): AssistantWorkView => ({
  work: { work_id: "w1", executor: { kind: "assistant" }, state: phase === "completed" ? "completed" : "running" }, reviews: [], cards: [], objects: [],
  rounds: [round(phase, turns)], ...extra } as AssistantWorkView);
/** What a reply draws beside the rows. */
const drawn = (one: AssistantWorkView) => (one as AssistantWorkView & { delivery_html?: string }).delivery_html;
/** The html of a view, or "" when it has no note. */
const html = (one: AssistantWorkView) => { const note = deliveryNote(one); return note ? deliveryNoteHtml(note, say) : ""; };
/** The note's groups by their heading: the part of the html under each, with the title under the empty one. */
const groups = (text: string) => Object.fromEntries(text.split('<p class="mw-receipt__who">').slice(1).map(part => [part.slice(0, part.indexOf("</p>")), part.slice(part.indexOf("</p>") + 4)]));

const steps = [{ id: "1", text: "整理数据", state: "done" as const }, { id: "2", text: "画图表", state: "in-progress" as const }, { id: "3", text: "写结论", state: "pending" as const }, { id: "4", text: "查旧稿", state: "abandoned" as const }];

/** The record the page puts in the conversation as it is: its key is the one the outcome slot's steps name. */
const WRAP = '<div class="mw-receipt" data-ix-record="delivery:w1" aria-live="off">';

const FORBIDDEN = /已生效|部分生效|已遵循|已采纳|已完成/;

/** A work that has everything in it: every kind of line the note can carry. */
const full = (end: "completed" | "failed" | "stopped" | "cancelled" = "completed"): AssistantWorkView => view(end, [
  turn("t1", "再加上第三季度的数字", steer("s1", "read", { model_claim: { treatment: "apply-now", kind: "supplement", targets: [], impacts: ["scope", "outputs"], revisions: 1 } })),
  turn("t2", "不是第三季度，是第四季度", steer("s2", "read", { about: "s1" })),
  turn("t3", "附上图表", steer("s3", "unread", { questions: [{ pending_id: "p1", state: "open" }, { pending_id: "p2", state: "unresolved" }] })),
  turn("n1", "这条是 Molis 的说明", steer("s9", "applied"), "notice"),
  turn("a1", "好的", undefined, "assistant"),
], {
  objects: [result("a", "周报"), result("b", "纪要", { state: "missing" }), result("c", "附件", { open: undefined }), { ...result("d", "来源页"), relation: "origin" }, { ...result("e", "素材"), relation: "material" }],
  delegated: [{ work_id: "c1", title: "查数据", state: "completed", follow_ups: 0 }, { work_id: "c2", title: "排版", state: "running", follow_ups: 0 }, { work_id: "c3", title: "被收回的", state: "running", follow_ups: 0, taken_back: true }],
  queued_inputs: [{ input_id: "q1", text: "顺便发给团队", source: "person" }, { input_id: "q2", text: "Molis 补的一句", source: "host" }, { input_id: "q3", text: "另一个会话说的", source: "peer" }] satisfies AgentQueuedInput[],
});

test("RCPT-369: the note exists only after the work's rounds have ended, and only when the person added something", () => {
  for (const [phase, end] of [["completed", "completed"], ["failed", "failed"], ["cancelled", "stopped"], ["stopped", "stopped"]] as const) assert.equal(deliveryNote(view(phase))?.end, end, `a round that ${phase}`);
  for (const phase of ["starting", "running", "awaiting-input", "awaiting-review", "paused", "compacting"]) assert.equal(deliveryNote(view(phase)), null, `none while a round is ${phase}`);
  const earlier = view("running", undefined, { rounds: [round("completed", [turn("t1", "补充", steer("s1", "read"))], [], "run-1"), round("running", [], [], "run-2")] });
  assert.equal(deliveryNote(earlier), null, "a live latest round: an earlier one that ended is not enough");
  const live = view("completed", undefined, { rounds: [round("running", [turn("t1", "补充", steer("s1", "read"))], [], "run-1"), round("completed", [], [], "run-2")] });
  assert.equal(deliveryNote(live), null, "any live round, not only the latest");
  assert.equal(deliveryNote(view("completed", [turn("t1", "整理周报")])), null, "nothing the person added: no note");
  assert.equal(deliveryNote(view("completed", [turn("n1", "Molis 的说明", steer("s1", "applied"), "notice")])), null, "a notice is not a supplement of the person's");
  assert.equal(deliveryNote({ ...view("completed"), rounds: [] }), null);
  assert.equal(deliveryNote(view("reconcile-required", undefined, { work: { work_id: "w1", executor: { kind: "assistant" }, state: "running" } as AssistantWorkView["work"] })), null, "a round that is not settled is not an end");
  for (const older of ["unknown", "reconcile-required"]) {
    const later = view("completed", undefined, { rounds: [round(older, [turn("t1", "补充", steer("s1", "read"))], [], "run-1"), round("completed", [], [], "run-2")] });
    assert.equal(deliveryNote(later)?.end, "completed", `an earlier round that is ${older} does not hide the note once the latest one has ended: only the latest round's phase says how it ended`);
  }
});

test("RCPT-369: the title follows how the latest round ended, always from the latest round, and no part of the note says it was followed or completed", () => {
  const titles = { completed: "截至最近一轮：最近一轮已结束", failed: "截至最近一轮：最近一轮失败", cancelled: "截至最近一轮：已停止", stopped: "截至最近一轮：已停止" };
  for (const [phase, title] of Object.entries(titles)) {
    const text = html(full(phase as "completed"));
    assert.ok(text.startsWith(`${WRAP}<div class="mw-receipt__body"><p class="mw-receipt__who">${title}</p>`), `${phase}: ${title}`);
    assert.doesNotMatch(text, FORBIDDEN, `${phase}: the words the ledger cannot vouch for`);
  }
  assert.doesNotMatch(Object.values(groups(html(full()))).join(""), FORBIDDEN, "a sub-task that ended is only said to have ended");
});

/** A work the Host reads as needing a check: the runtime asks for one, or a continuation is blocked (`assistant-continuations.ts`). */
const checking = { work: { work_id: "w1", executor: { kind: "assistant" }, state: "needs-check" } as AssistantWorkView["work"], objects: [result("a", "周报")] };

test("RCPT-369: a latest round that is not settled (reconcile-required, unknown) has no note and no result step, whatever the work's state says", () => {
  for (const phase of ["reconcile-required", "unknown"]) {
    const one = view(phase, undefined, checking);
    assert.equal(deliveryNote(one), null, `${phase}: the round has not ended, so there is no note to title`);
    assert.equal(html(one), "");
    assert.deepEqual(deliverySteps(one, say), [], `${phase}: no step to the note`);
    assert.deepEqual(assistantOutcomeSteps(one, say), [], `${phase}: the slot gives no result step: what the round made is not known yet`);
  }
  const one = view("reconcile-required", undefined, checking);
  const row = assistantStepRow(one, say);
  assert.match(row.next_all_html, /data-ix-step-id="check"/, "…what waits on the person is still the check, from the waiting place");
  assert.doesNotMatch(row.next_all_html, /data-ix-step-id="delivery:w1|data-ix-step-id="open:/, "…and nothing after it opens a result");
  drawAssistantReply({ view: one }, { say, drafts: () => ({}), card: () => "" });
  assert.equal(drawn(one), "", "a reply carries no note either");
});

test("RCPT-369: the title is the latest round's, even when a continuation leaves the work needing a check; the check comes first in the row", () => {
  const one = view("completed", undefined, checking);
  assert.equal(deliveryNote(one)?.end, "completed", "the round did end; the work's state is the check's, not the round's");
  assert.ok(html(one).startsWith(`${WRAP}<div class="mw-receipt__body"><p class="mw-receipt__who">截至最近一轮：最近一轮已结束</p>`));
  assert.doesNotMatch(html(one), /中断|结果待核对/, "a round that completed is not called interrupted");
  const ids = [...assistantStepRow(one, say).next_all_html.matchAll(/data-ix-step-id="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(ids, ["check", "delivery:w1", "delivery:w1:open:page:a"], "「去核对」 first, then the note and the result");
  for (const phase of ["failed", "stopped", "cancelled"]) assert.equal(deliveryNote(view(phase, undefined, checking))?.end, phase === "failed" ? "failed" : "stopped", `${phase}: from the round, not the work`);
});

test("RCPT-370: the ledger's facts and the AI's own statement are two groups, each supplement's line a button to its receipt", () => {
  const parts = groups(html(full()));
  assert.deepEqual(Object.keys(parts).slice(0, 3), ["截至最近一轮：最近一轮已结束", "记录里的", "AI 自己说的，Molis 没有核对"], "the records first, then what the AI says of itself");
  assert.match(parts["记录里的"]!, /data-input="s1"[^>]*>「再加上第三季度的数字」<\/button> · AI 已读到/);
  assert.match(parts["记录里的"]!, /data-input="s3"[^>]*>「附上图表」<\/button> · 这一轮结束时 AI 没读到，留给下一轮 · 为它问的问题：等你回答 · 为它问的问题：这一轮结束时还没回答/, "the ledger's state and its questions");
  assert.doesNotMatch(parts["记录里的"]!, /立即影响当前这一步|影响/, "what the AI says is not among the facts");
  assert.match(parts["AI 自己说的，Molis 没有核对"]!, /data-input="s1"[^>]*>「再加上第三季度的数字」<\/button> · 立即影响当前这一步 · 影响范围、已有成果/, "the AI's treatment and what it says it changes");
  assert.match(parts["AI 自己说的，Molis 没有核对"]!, /data-input="s2"[^>]*>「不是第三季度，是第四季度」<\/button> · AI 读到了，没说怎么处理/, "read, with no statement");
  assert.doesNotMatch(parts["AI 自己说的，Molis 没有核对"]!, /data-input="s3"/, "unread, no statement: nothing for the AI to say");
  assert.deepEqual(deliveryNote(full())?.supplements.map(one => one.id), ["s1", "s2", "s3"], "send order");
  const planned = full();
  planned.rounds[0]!.steps = steps;
  const stated = groups(html(planned));
  assert.match(stated["AI 自己说的，Molis 没有核对"]!, /<li>AI 报告的步骤：整理数据 · 模型报告完成<\/li>/, "the AI's list of its own steps: its report of done, not a check");
  assert.match(stated["AI 自己说的，Molis 没有核对"]!, /AI 报告的步骤：画图表 · 进行中.*AI 报告的步骤：写结论 · 尚未开始.*AI 报告的步骤：查旧稿 · 已取消/);
  for (const [heading, content] of Object.entries(stated)) if (heading !== "AI 自己说的，Molis 没有核对") assert.doesNotMatch(content, /AI 报告的步骤/, `${heading}: the AI's steps are in its own group only`);
  assert.doesNotMatch(Object.values(stated).join(""), FORBIDDEN);
  const only = view("completed", [turn("t1", "补充", steer("s1", "unread"))]);
  only.rounds[0]!.steps = steps;
  assert.match(groups(html(only))["AI 自己说的，Molis 没有核对"]!, /AI 报告的步骤：整理数据/, "the AI's steps need no statement about a supplement");
});

test("RCPT-370: a correction points back to its original, a notice is not listed, and a line the Host or another session wrote is marked", () => {
  const text = groups(html(full()))["记录里的"]!;
  assert.match(text, /data-input="s2"[^>]*>「不是第三季度，是第四季度」<\/button> · AI 已读到 · 纠正：针对「再加上第三季度的数字」/, "the correction names the supplement it corrects");
  const alone = view("completed", [turn("t2", "不是这个意思", steer("s2", "read", { about: "s-gone" }))]);
  assert.match(html(alone), /纠正：针对更早的一条/, "its original is not among the rounds shown: said so, not guessed");
  const whole = html(full());
  assert.doesNotMatch(whole, /Molis 的说明|data-input="s9"/, "a notice turn is Molis's own line, not the person's words");
  const queue = groups(whole)["还差什么"]!;
  assert.match(queue, /排在队里：「顺便发给团队」<\/li>/, "the person's own: no mark");
  assert.match(queue, /排在队里：「Molis 补的一句」 · Molis 写的/);
  assert.match(queue, /排在队里：「另一个会话说的」 · 别的会话写的/);
  assert.equal(groups(html(view("completed", [turn("t1", "补充", steer("s1", "withdrawn"))])))["AI 自己说的，Molis 没有核对"], undefined, "no statement and nothing read: that group is not drawn");
});

test("RCPT-371: the results are the work's result edges only, in their place in the view, and openable by the test the round outcome uses", () => {
  const objects = [result("o", "来源页", { relation: "origin" }), result("a", "周报"), result("m", "素材", { relation: "material" }), result("b", "纪要", { state: "missing" }), result("c", "附件", { open: undefined }), result("d", "会议记录", { state: "changed" })];
  const one = view("completed", undefined, { objects });
  const parts = groups(html(one));
  const made = parts["这项工作做出的结果"]!;
  assert.ok(made.includes('<button class="assistant-inline-object" type="button" data-assistant-object="1" data-ix-press="open:page:a">周报</button>'), "the page binds this as a reply's button, by the object's place in view.objects");
  assert.ok(made.includes('type="button" data-assistant-object="5" data-ix-press="open:page:d">会议记录</button> · 之后被改过'), "an openable result keeps what happened to it since");
  assert.doesNotMatch(made, /来源页|素材/, "what the work started from or was given is not what it made");
  assert.match(made, /<li>纪要 · 已不存在<\/li>/, "gone: text with its state, no button");
  assert.match(made, /<li>附件<\/li>/, "nowhere to open: text, no button");
  assert.equal(made.match(/<button/g)?.length, 2);
  assert.deepEqual(deliveryNote(one)?.results.map(item => [item.index, item.open]), objects.flatMap((object, index) => object.relation === "result" ? [[index, isOpenable(object)]] : []), "the same exported test");
  assert.deepEqual(objects.map(isOpenable), [true, true, true, false, false, true], "a place to open it and an owner that still has it");
  const steps = assistantOutcomeSteps(view("completed", [turn("t0", "整理周报")], { objects }), say);
  assert.deepEqual(steps.map(step => step.id), ["open:page:a", "open:page:d"], "with no note the round outcome opens exactly the results the note would");
});

test("RCPT-371: nothing says which result came of which supplement, and nothing is matched by time", () => {
  const near = view("completed", [turn("t1", "再加上第三季度的数字", steer("s1", "read"))], { objects: [result("a", "周报", { recorded_at: "2026-10-19T00:00:00.000Z" })] });
  const note = deliveryNote(near);
  assert.deepEqual(Object.keys(note!.results[0]!).sort(), ["id", "index", "kind", "movedTo", "open", "state", "title"], "a result carries its own facts, no supplement");
  const parts = groups(html(near));
  assert.doesNotMatch(parts["这项工作做出的结果"]!, /data-input|再加上/, "the results are listed on their own");
  assert.doesNotMatch(parts["记录里的"]!, /周报/);
});

test("RCPT-372: what is still missing lists every open item, and a queue that was not read is not the same as one that is empty", () => {
  const lacks = (rounds: AssistantWorkView) => groups(html(rounds))["还差什么"] ?? "";
  const base = view("completed", [turn("t1", "附上图表", steer("s3", "unread", { questions: [{ pending_id: "p1", state: "open" }, { pending_id: "p2", state: "unresolved" }, { pending_id: "p3", state: "settled" }] }))], {
    objects: [result("b", "纪要", { state: "missing" }), result("u", "草稿", { state: "unavailable" }), result("f", "成稿")],
    delegated: [{ work_id: "c1", title: "查数据", state: "completed", follow_ups: 0 }, { work_id: "c2", title: "排版", state: "waiting-input", follow_ups: 0 }],
  });
  base.rounds[0]!.activity = [{ call_id: "k1", verb: "change", target: "周报", state: "unknown" }, { call_id: "k2", verb: "file-change", target: "报告.md", state: "started" }, { call_id: "k3", verb: "change", target: "预算表", state: "completed" }, { call_id: "k4", verb: "read", target: "旧稿", state: "unknown" }];
  const text = lacks(base);
  assert.match(text, /data-input="s3"[^>]*>「附上图表」<\/button> · 这一轮结束时 AI 没读到，留给下一轮<\/li>/, "a supplement the AI has not read");
  assert.match(text, /为它问的问题：等你回答<\/li>/); assert.match(text, /为它问的问题：这一轮结束时还没回答<\/li>/);
  assert.doesNotMatch(text, /为它问的问题：已回答/, "an answered question is not missing");
  assert.match(text, /<li>子任务：排版 · 等你回答<\/li>/); assert.doesNotMatch(text, /查数据/, "a sub-task that ended is not missing");
  assert.match(text, /<li>改动：周报 · 结果未确认<\/li>/); assert.match(text, /<li>改动：报告\.md · 结果未确认<\/li>/, "a change with no outcome");
  assert.doesNotMatch(text, /预算表|旧稿/, "a change that finished, or a read, is not missing");
  assert.match(text, /<li>读不到的结果：纪要 · 已不存在<\/li>/); assert.match(text, /<li>读不到的结果：草稿 · 暂时读不到<\/li>/); assert.doesNotMatch(text, /成稿/);
  assert.doesNotMatch(text, /排在队里|没有排队/, "a queue that was not read says nothing");
  const done = groups(html(base))["做了什么"]!;
  assert.match(done, /<li>改动：预算表 · 已修改<\/li>/); assert.match(done, /<li>子任务：查数据 · 已结束<\/li>/); assert.doesNotMatch(done, /周报|排版/);
  assert.equal(base.queued_inputs, undefined);
  const none = lacks({ ...base, queued_inputs: [] });
  assert.match(none, /<li>没有排队<\/li>/, "read, and nothing waits");
  assert.notEqual(none, text); assert.notEqual(html({ ...base, queued_inputs: [] }), html(base));
  const clean = view("completed", [turn("t1", "附上图表", steer("s3", "read"))]);
  assert.equal(lacks(clean), "", "nothing missing and the queue not read: no group at all");
  assert.match(lacks({ ...clean, queued_inputs: [] }), /<li>没有排队<\/li>/, "an empty queue that was read is still said");
});

test("RCPT-373: the delivery note leads the outcome slot with two steps; a failed round gives only the retry, a live one nothing", () => {
  const objects = [result("a", "周报"), result("b", "纪要"), result("c", "附件")];
  const one = view("completed", undefined, { objects });
  assert.deepEqual(assistantOutcomeSteps(one, say).map(step => [step.id, step.label]), [["delivery:w1", "看交付说明"], ["delivery:w1:open:page:a", "打开「周报」"]], "the note, then the first result through the note's own button");
  assert.equal(assistantOutcomeSteps(one, say).length, 2, "at most two");
  assert.deepEqual(deliverySteps(one, say).map(step => step.id), ["delivery:w1", "delivery:w1:open:page:a"]);
  assert.equal(deliveryNote(one)?.record, deliverySteps(one, say)[0]?.id, "one key for the record, written once by the Host");
  assert.deepEqual(assistantOutcomeSteps(view("completed"), say).map(step => step.id), ["delivery:w1"], "no result that opens: only the note");
  const unopenable = view("completed", undefined, { objects: [result("a", "周报", { state: "missing" }), result("c", "附件", { open: undefined })] });
  assert.deepEqual(assistantOutcomeSteps(unopenable, say).map(step => step.id), ["delivery:w1"]);
  const failed = view("failed", undefined, { objects });
  assert.deepEqual(assistantOutcomeSteps(failed, say), [{ id: "retry", label: "用同样的话再试一次", source: "整理周报" }], "failed: the retry alone");
  assert.deepEqual(deliverySteps(failed, say), []);
  assert.ok(html(failed), "…and the note is still drawn");
  assert.deepEqual(assistantOutcomeSteps(view("running"), say), []); assert.deepEqual(deliverySteps(view("running"), say), []);
  assert.deepEqual(assistantOutcomeSteps(view("completed", [turn("t0", "整理周报")], { objects }), say).map(step => step.id), ["open:page:a", "open:page:b"], "no supplement, no note: the round's own outcome");
  assert.match(assistantStepRow(one, say).next_html, /data-ix-step-id="delivery:w1"/, "the row draws the step");
  assert.match(assistantStepRow(one, say).next_html, /data-ix-step-id="delivery:w1:open:page:a"/);
});

test("RCPT-373: a reply carries the note beside the rows, empty when there is none", () => {
  const ports = { say, drafts: () => ({}), card: () => "" };
  const noted = full(), plain = view("completed", [turn("t0", "整理周报")]), running = view("running");
  for (const body of [{ view: noted }, noted, { view: plain }, { view: running }]) drawAssistantReply(body, ports);
  assert.equal(drawn(noted), html(noted));
  assert.ok(drawn(noted)?.startsWith(`${WRAP}<div class="mw-receipt__body">`));
  assert.equal(drawn(plain), "", "no supplement: no note");
  assert.equal(drawn(running), "", "a round under way: no note");
});

test("RCPT-374: the person's words and every title stay text, however they are written", () => {
  const attack = '<img src=x onerror="alert(1)">';
  const rich = view("completed", [turn("t1", attack + "再加上数字", steer("s1", "read", { model_claim: { treatment: "apply-now", targets: [], impacts: ["scope"], revisions: 1 } })), turn("t2", "改一下", steer("s2", "unread", { about: "s1" }))], {
    objects: [result("a", attack, { moved_to: undefined }), result("b", attack, { state: "moved", open: undefined, moved_to: { title: attack, kind: "project" } }), result("c", "x\"onclick=\"y")],
    delegated: [{ work_id: "c1", title: attack, state: "running", follow_ups: 0 }],
    queued_inputs: [{ input_id: "q1", text: attack, source: "host" }],
  });
  rich.rounds[0]!.activity = [{ call_id: "k1", verb: "change", target: attack, state: "completed" }];
  const text = html(rich);
  assert.doesNotMatch(text, /<img|onerror="/, "no tag from the person's words or a title");
  assert.ok(text.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"), "shown as the text it was written as");
  assert.doesNotMatch(text, /x"onclick/, "a quote cannot close an attribute");
  assert.ok(text.includes("…"), "long words are cut for the button, never in the middle of a tag");
  assert.doesNotMatch(text.replace(/<\/?(?:div|p|ul|li|button|small)\b[^>]*>/g, ""), /[<>]/, "every angle bracket outside the note's own tags is escaped");
  assert.match(deliverySteps(rich, say).map(step => step.label).join("|"), /看交付说明\|打开「<img src=x/, "a step's label is plain text for the row, which escapes it when it draws");
  assert.ok(assistantStepRow(rich, say).next_html.includes("&lt;img src=x"), "…and does");
});

test("RCPT-374: every line of the note has its English, and what is new is written as whole sentences", () => {
  const asked: string[] = [], recording = (text: string, values?: Record<string, string | number>) => (asked.push(text), say(text, values));
  const wide = full("failed");
  wide.rounds[0]!.steps = steps;
  wide.rounds[0]!.activity = [{ call_id: "k1", verb: "change", target: "周报", state: "completed" }, { call_id: "k2", verb: "change", target: "预算", state: "unknown" }, { call_id: "k3", verb: "change", target: "表", state: "failed" }];
  wide.objects.push(result("m", "移走的", { state: "moved", open: undefined, moved_to: { title: "别处", kind: "project" } }), result("n", "挪去别处", { state: "moved", open: undefined }), result("u", "读不到", { state: "unavailable", open: undefined }), result("g", "改过", { state: "changed" }));
  wide.delegated = ["idle", "running", "waiting-input", "waiting-review", "paused", "completed", "failed", "stopped", "needs-check"].map((state, index) => ({ work_id: `c${index}`, title: state, state: state as "idle", follow_ups: 0 }));
  for (const phase of ["completed", "failed", "stopped"] as const) deliveryNoteHtml(deliveryNote({ ...wide, rounds: [{ ...wide.rounds[0]!, phase }] })!, recording);
  deliveryNoteHtml(deliveryNote({ ...wide, rounds: [{ ...wide.rounds[0]!, phase: "completed" }], work: { ...wide.work, state: "needs-check" } })!, recording);
  deliveryNoteHtml(deliveryNote({ ...wide, queued_inputs: [] })!, recording);
  deliverySteps(wide, recording); deliverySteps({ ...wide, rounds: [{ ...wide.rounds[0]!, phase: "completed" }] }, recording);
  const missing = [...new Set(asked)].filter(key => EN[key] === undefined);
  assert.deepEqual(missing, [], "each Chinese line has an English one");
  const written = ["截至最近一轮：最近一轮已结束", "截至最近一轮：最近一轮失败", "截至最近一轮：已停止", "做了什么", "这项工作做出的结果", "还差什么", "为它问的问题：", "AI 报告的步骤：", "改动：", "子任务：", "读不到的结果：", "排在队里：",
    "没有排队", "Molis 写的", "别的会话写的", "看交付说明", "这项工作的补充和结果"];
  for (const key of written) {
    assert.ok(asked.includes(key), `the note uses ${key}`);
    assert.match(EN[key]!, /^[A-Z]/, `${key}: starts a sentence`);
    assert.doesNotMatch(EN[key]!, /[一-鿿]/, `${key}: no Chinese left in it`);
  }
  for (const key of written.slice(0, 3)) assert.doesNotMatch(EN[key]!, /\b(?:followed|completed|took effect)\b/i, "no claim the ledger cannot vouch for");
  assert.equal(EN["没有排队"], "Nothing is waiting in the queue.");
});
