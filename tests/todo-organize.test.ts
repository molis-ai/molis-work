import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { modelPromptText, type InstructedPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { TODO_ACTION_PERMISSIONS, createTodoActionHandlers, openTodoStore, passageFound, todoActions, todoManifest, todoOrganizeActions as organize } from "@molis-ai/molis-work-plugin-todo";

const TODAY = "2026-09-28";
const MAIL = { title: "张总：新版方案", subject: { kind: "feed_item", id: "mail-1" }, received_at: "2026-09-28T09:00:00+08:00",
  text: "小王你好，请周五前发新版方案，预算等小李确认。另外，下周的团建改到周四，大家知悉。" };

type Model = (prompt: InstructedPrompt) => string;
function fixture(t: { after(fn: () => void): void }, model: Model | null) {
  const home = mkdtempSync(join(tmpdir(), "todo-organize-"));
  const store = openTodoStore(home);
  const service = new ActionService();
  const prompts: InstructedPrompt[] = [];
  service.registerProvider({ provider: { provider_id: todoManifest.plugin_id, plugin_id: todoManifest.plugin_id, title: "待办", kind: "plugin" },
    definitions: [...todoManifest.actions!], handlers: createTodoActionHandlers({ withStore: run => run(store), today: () => TODAY,
      ...(model ? { completeText: async (prompt: InstructedPrompt) => { prompts.push(prompt); return model(prompt); } } : {}) }) });
  t.after(() => { store.close(); rmSync(home, { recursive: true, force: true }); });
  const as = (project_id: string | null, audience: ActionCallContext["audience"] = "user") =>
    bindActionClient(service, () => ({ actor_id: audience === "user" ? "web-user" : "assistant", project_id, audience, permissions: [...TODO_ACTION_PERMISSIONS] }));
  return { service, me: as(null), agent: as(null, "agent"), inA: as("project-a"), agentA: as("project-a", "agent"), inB: as("project-b"), prompts };
}

/** What a model would answer for the example in spec 6.6, plus one invented passage that must not survive. */
const exampleAnswer = (existing?: { id: string; relation: string; changes?: Record<string, unknown> }) => JSON.stringify({
  candidates: [
    { ref: "c1", kind: "request", title: "发送新版方案", why: "张总要求周五前收到", owner: { who: "你", stated: true },
      due: { date: "2026-10-02", time: null, phrase: "周五前" }, suggested_date: null, topic: "Q4 方案", placement: "project",
      evidence: [{ material: 1, excerpt: "请周五前发新版方案" }], uncertain: ["发给谁没写，推测是张总"], depends_on: ["c2"], existing: existing ?? null },
    { ref: "c2", kind: "waiting", title: "等待小李确认预算", why: "预算要小李确认", owner: { who: "小李", stated: true }, due: { date: null, time: null, phrase: null },
      waiting: { who: "小李", what: "确认预算" }, evidence: [{ material: 1, excerpt: "预算等小李确认" }], uncertain: [], depends_on: [] },
    { ref: "c3", kind: "suggestion", title: "今天催小李确认预算", why: "预算确认影响周五交付", owner: { who: "你", stated: false },
      due: { date: "2026-09-28", time: null, phrase: "今天" }, evidence: [{ material: 1, excerpt: "预算等小李确认" }], uncertain: [], depends_on: [] },
    { ref: "c4", kind: "request", title: "准备季度汇报", why: "编的", owner: { who: "你", stated: true }, due: { date: null, time: null, phrase: null },
      evidence: [{ material: 1, excerpt: "请在月底前准备季度汇报材料" }], uncertain: [], depends_on: [] },
  ],
  reference_only: [{ summary: "下周团建改到周四（通知）", material: 1 }],
});

test("passages must really be in the material; small spacing and punctuation differences still match", () => {
  assert.equal(passageFound("请周五前发新版方案", MAIL.text), true);
  assert.equal(passageFound("请 周五前 发新版方案。", MAIL.text), true);
  assert.equal(passageFound("请在月底前准备季度汇报材料", MAIL.text), false);
});

test("organizing the spec example: invented passages dropped, unstated dates only suggested, relation kept, suggestion unselected, reference listed", async t => {
  const f = fixture(t, () => exampleAnswer());
  const { batch } = await f.agent.invoke(organize.extract, { materials: [MAIL], request: "帮我整理这些材料里需要我做的事" });
  assert.equal(f.prompts.length, 1);
  assert.match(modelPromptText(f.prompts[0]!), /请周五前发新版方案/u, "材料作为数据交给登记的整理方法");
  assert.equal(f.prompts[0]!.instruction.prompt_id, "todo.organize.basic");
  assert.equal(batch.origin, "assistant");
  assert.deepEqual(batch.candidates.map(candidate => [candidate.kind, candidate.title, candidate.selected]), [
    ["request", "发送新版方案", true], ["waiting", "等待小李确认预算", true], ["suggestion", "今天催小李确认预算", false]]);
  const [send, wait, nudge] = batch.candidates;
  assert.deepEqual([send!.due_date, send!.due_phrase], ["2026-10-02", "周五前"]);
  assert.deepEqual(send!.depends_on, [wait!.candidate_id]);
  assert.equal(send!.placement, "project", "建议放进项目；没有项目时采用会放进暂未归类");
  assert.equal(nudge!.due_date, null, "原文没写“今天催”，日期只作建议");
  assert.equal(nudge!.suggested_date, "2026-09-28");
  assert.ok(nudge!.uncertain.some(line => line.includes("推测")));
  assert.deepEqual(batch.reference_only, [{ summary: "下周团建改到周四（通知）", material: 1 }]);
  assert.ok(batch.notes.includes("1 条在原文里找不到依据，已略去"));
  assert.equal(batch.materials[0]!.subject?.id, "mail-1");
});

test("applying choices: added with sources and waiting state, linked by dependency, ignored remembered; the same mail again brings nothing back; undo removes it all", async t => {
  const f = fixture(t, () => exampleAnswer());
  const { batch } = await f.me.invoke(organize.extract, { materials: [MAIL] });
  const [send, wait, nudge] = batch.candidates;
  const applied = await f.me.invoke(organize.apply, { id: batch.batch_id, expected_revision: batch.revision, decisions: [
    { candidate_id: send!.candidate_id, action: "add", edits: { planned_date: "2026-10-01" } },
    { candidate_id: wait!.candidate_id, action: "add" },
    { candidate_id: nudge!.candidate_id, action: "ignore", ignore_reason: "不需要" },
  ] });
  assert.equal(applied.batch.status, "done");
  const items = (await f.me.invoke(todoActions.list, { view: "all" })).items;
  const sent = items.find(item => item.title === "发送新版方案")!, waiting = items.find(item => item.title === "等待小李确认预算")!;
  assert.deepEqual([sent.due_date, sent.planned_date, sent.status], ["2026-10-02", "2026-10-01", "open"]);
  assert.deepEqual([waiting.status, waiting.waiting?.who], ["waiting", "小李"]);
  assert.equal(sent.sources[0]!.excerpt, "请周五前发新版方案");
  assert.equal(sent.sources[0]!.subject?.id, "mail-1");
  assert.deepEqual(sent.links.map(link => [link.relation, link.subject.id]), [["blocked_by", waiting.id]]);
  await assert.rejects(f.me.invoke(organize.apply, { id: batch.batch_id, decisions: [{ candidate_id: send!.candidate_id, action: "add" }] }), { code: "todo.conflict" });

  const again = await f.me.invoke(organize.extract, { materials: [MAIL] });
  assert.deepEqual(again.batch.candidates, [], "处理过和忽略过的不再列出");
  assert.ok(again.batch.notes.includes("你之前忽略过的 1 条没有再列出"));
  assert.ok(again.batch.notes.includes("已经在待办里的 2 条没有再列出"));

  const undone = await f.me.invoke(todoActions.revert, { batch_id: applied.change_batch_id });
  assert.equal(undone.removed_ids.length, 2);
  assert.equal((await f.me.invoke(todoActions.list, { view: "all" })).items.length, 0);
  const reopened = (await f.me.invoke(organize.get, { id: batch.batch_id })).batch;
  assert.equal(reopened.status, "open", "撤销加入后，这两项回到待确认");
  assert.deepEqual(reopened.candidates.map(candidate => candidate.decision?.action ?? null), [null, null, "ignored"]);
});

test("an existing todo: the same thing merges sources, a hand-edited date stays the person's unless they take the new one, maybe-done completes only when chosen", async t => {
  let answer = "";
  const f = fixture(t, () => answer);
  const existing = (await f.me.invoke(todoActions.create, { title: "发送新版方案", due_date: "2026-10-05" })).item;
  await f.me.invoke(todoActions.update, { id: existing.id, due_date: "2026-10-06" });
  answer = exampleAnswer({ id: existing.id, relation: "update", changes: { due_date: "2026-10-02" } });
  const { batch } = await f.me.invoke(organize.extract, { materials: [MAIL] });
  const send = batch.candidates.find(candidate => candidate.title === "发送新版方案")!;
  assert.equal(send.existing?.relation, "conflict");
  assert.deepEqual(send.existing?.protected, [{ field: "due_date", value: "2026-10-02" }]);
  assert.equal(send.selected, false, "冲突默认不动");
  await f.me.invoke(organize.apply, { id: batch.batch_id, decisions: [{ candidate_id: send.candidate_id, action: "update" }] });
  let item = (await f.me.invoke(todoActions.get, { id: existing.id })).item;
  assert.equal(item.due_date, "2026-10-06", "不选就保留你改过的日期");
  assert.equal(item.sources.length, 2, "补上这封邮件作为来源");

  answer = JSON.stringify({ candidates: [{ ref: "c1", kind: "request", title: "发送新版方案", why: "张总确认收到", owner: { who: "你", stated: true },
    due: { date: null, phrase: null }, evidence: [{ material: 1, excerpt: "方案已收到，谢谢" }], existing: { id: existing.id, relation: "maybe_done", reason: "张总回信说收到了" } }] });
  const reply = { title: "张总：收到", text: "方案已收到，谢谢。", subject: { kind: "feed_item", id: "mail-2" } };
  const second = (await f.me.invoke(organize.extract, { materials: [reply] })).batch;
  assert.equal(second.candidates[0]!.existing?.relation, "maybe_done");
  assert.equal((await f.me.invoke(todoActions.get, { id: existing.id })).item.status, "open", "疑似完成只是提议");
  await f.me.invoke(organize.apply, { id: second.batch_id, decisions: [{ candidate_id: second.candidates[0]!.candidate_id, action: "complete" }] });
  item = (await f.me.invoke(todoActions.get, { id: existing.id })).item;
  assert.equal(item.status, "done");
});

test("organizing needs a model, replays a request, and keeps a project's batches in that project", async t => {
  const none = fixture(t, null);
  const directory = await none.me.discover();
  assert.equal(directory.find(view => view.capability_id === "todo.organize.extract")!.availability.available, false);
  const f = fixture(t, () => exampleAnswer());
  const first = await f.inB.invoke(organize.extract, { materials: [MAIL], request_id: "r-1" });
  const replay = await f.inB.invoke(organize.extract, { materials: [MAIL], request_id: "r-1" });
  assert.equal(replay.replayed, true);
  assert.equal(replay.batch.batch_id, first.batch.batch_id);
  assert.equal(f.prompts.length, 1);
  assert.equal((await f.inB.invoke(organize.list, {})).batches.length, 1);
  assert.equal((await f.agentA.invoke(organize.list, {})).batches.length, 0);
  await assert.rejects(f.agentA.invoke(organize.get, { id: first.batch.batch_id }), { code: "todo.not_found" });
  const context = await f.inB.invoke(organize.subject, { subject_id: first.batch.batch_id });
  assert.equal(context.open?.id, "batch:" + first.batch.batch_id);
  assert.match(context.content, /\[要你处理\] 发送新版方案/u);
});

test("a reply with fences, notes or reasoning around the JSON still yields the organizing result", async () => {
  const { organizeJson } = await import("@molis-ai/molis-work-plugin-todo");
  const body = '{"candidates":[{"ref":"c1","title":"含 } 括号的标题"}],"reference_only":[]}';
  assert.equal((organizeJson("```json\n" + body + "\n```") as any).candidates[0].title, "含 } 括号的标题");
  assert.equal((organizeJson("思考：先看 {材料} 再输出。\n" + body + "\n以上。") as any).candidates.length, 1);
  assert.throws(() => organizeJson("没有 JSON"), /不是有效 JSON/);
});

test("date phrases are read against when the material was written, not by the model's arithmetic; real ambiguity is kept as a suggestion", async () => {
  const { readDatePhrase } = await import("@molis-ai/molis-work-plugin-todo");
  const monday = new Date(2026, 8, 28, 9, 12).toISOString(), sunday = new Date(2026, 8, 27, 16, 0).toISOString();
  assert.deepEqual(readDatePhrase("周四上午10点", monday, "2026-09-28"), { date: "2026-10-01", time: "10:00", ambiguous: null });
  assert.deepEqual(readDatePhrase("今天下班前", monday, "2026-09-28"), { date: "2026-09-28", time: null, ambiguous: null });
  assert.equal(readDatePhrase("今天下班前", "2026-09-28T10:05:00+08:00", "2026-09-28")?.date, "2026-09-28", "按写信人的当地日期读，不换算到本机时区");
  assert.equal(readDatePhrase("周一", monday, "2026-09-28")?.date, "2026-10-05", "周一说“周一”指下周一");
  assert.match(readDatePhrase("下周一前", sunday, "2026-09-28")!.ambiguous!, /周日说的/u);
  assert.match(readDatePhrase("周五前", null, "2026-09-28")!.ambiguous!, /材料没有写时间/u);
  assert.deepEqual(readDatePhrase("10月2日", null, "2026-09-28"), { date: "2026-10-02", time: null, ambiguous: null });
  assert.equal(readDatePhrase("下次会前", monday, "2026-09-28"), null);
});

test("a stated due date that differs from an existing todo is an update, or a conflict when the person set that date, even if the model says same", async t => {
  let answer = "";
  const f = fixture(t, () => answer);
  const mine = (await f.me.invoke(todoActions.create, { title: "发送新版方案", due_date: "2026-10-05" })).item;
  await f.me.invoke(todoActions.update, { id: mine.id, due_date: "2026-10-06" });
  const theirs = (await f.agent.invoke(todoActions.create, { title: "等待小李确认预算", due_date: "2026-10-09" })).item;
  answer = JSON.stringify({ candidates: [
    { ref: "c1", kind: "request", title: "发送新版方案", owner: { who: "你", stated: true }, due: { date: "2026-10-02", phrase: "周五前" }, evidence: [{ material: 1, excerpt: "请周五前发新版方案" }], existing: { id: mine.id, relation: "same" } },
    { ref: "c2", kind: "waiting", title: "等待小李确认预算", owner: { who: "小李", stated: true }, due: { date: "2026-10-02", phrase: "周五前" }, evidence: [{ material: 1, excerpt: "预算等小李确认" }], existing: { id: theirs.id, relation: "same" } },
  ] });
  const { batch } = await f.me.invoke(organize.extract, { materials: [MAIL] });
  assert.deepEqual(batch.candidates.map(candidate => [candidate.existing?.relation, candidate.existing?.changes, candidate.existing?.protected]), [
    ["conflict", {}, [{ field: "due_date", value: "2026-10-02" }]],
    ["update", { due_date: "2026-10-02" }, []],
  ]);
});

test("the time a phrase was written comes from the material itself: the chat line's stamp, the mail header, the date at the top", async () => {
  const { phraseWrittenAt } = await import("@molis-ai/molis-work-plugin-todo");
  const chat = "[2026-09-27 22:10] 阿杰: 收到\n[2026-09-28 09:40] 小王: 好的，我今天下班前把会议纪要发群里。";
  assert.equal(phraseWrittenAt({ text: chat, received_at: null }, "今天下班前"), "2026-09-28T09:40");
  assert.equal(phraseWrittenAt({ text: "Q4 规划会纪要（2026年9月27日）\n小王下周三前整理竞品对比。", received_at: null }, "下周三前"), "2026-09-27T12:00");
  assert.equal(phraseWrittenAt({ text: "请周五前发方案。", received_at: "2026-09-28T09:00:00+08:00" }, "周五前"), "2026-09-28T09:00:00+08:00");
  assert.equal(phraseWrittenAt({ text: "请周五前发方案。", received_at: null }, "周五前"), null);
});

test("a phrase no rule can read (“这周”) never becomes a due date on the model's word", async t => {
  const f = fixture(t, () => JSON.stringify({ candidates: [{ ref: "c1", kind: "waiting", title: "等阿杰给报价", owner: { who: "阿杰", stated: true },
    due: { date: "2026-09-28", phrase: "这周" }, evidence: [{ material: 1, excerpt: "报价我这周搞定" }] }] }));
  const { batch } = await f.me.invoke(organize.extract, { materials: [{ title: "群聊", text: "[2026-09-28 09:41] 阿杰: 报价我这周搞定" }] });
  assert.deepEqual([batch.candidates[0]!.due_date, batch.candidates[0]!.suggested_date], [null, "2026-09-28"]);
  assert.ok(batch.candidates[0]!.uncertain.some(line => line.includes("只是估计")));
});
