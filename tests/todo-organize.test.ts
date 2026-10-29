import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { modelPromptText, type InstructedPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { TODO_ACTION_PERMISSIONS, createTodoActionHandlers, passageFound, todoActions, todoManifest, todoOrganizeActions as organize, ownTodoStores } from "@molis-ai/molis-work-plugin-todo";
import { openTodoStore } from "./fixtures/plugin-home-stores.js";

const TODAY = "2026-09-28";

// W2-18-TODO-DATE-01: assertions below exercise extraction, protected-field adoption and owner readback.
const MAIL = { title: "张总：新版方案", subject: { kind: "feed_item", id: "mail-1" }, received_at: "2026-09-28T09:00:00+08:00",
  text: "小王你好，请周五前发新版方案，预算等小李确认。另外，下周的团建改到周四，大家知悉。" };

type Model = (prompt: InstructedPrompt) => string;
function fixture(t: { after(fn: () => void): void }, model: Model | null) {
  const home = mkdtempSync(join(tmpdir(), "todo-organize-"));
  const store = openTodoStore(home);
  const service = new ActionService();
  const prompts: InstructedPrompt[] = [];
  service.registerProvider({ provider: { provider_id: todoManifest.plugin_id, plugin_id: todoManifest.plugin_id, title: "待办", kind: "plugin" },
    definitions: [...todoManifest.actions!], handlers: createTodoActionHandlers({ ...ownTodoStores(run => run(store)), today: () => TODAY,
      ...(model ? { completeText: async (prompt: InstructedPrompt) => { prompts.push(prompt); return model(prompt); } } : {}) }) });
  t.after(() => { store.close(); rmSync(home, { recursive: true, force: true }); });
  const as = (project_id: string | null, audience: ActionCallContext["audience"] = "user") =>
    bindActionClient(service, () => ({ actor_id: audience === "user" ? "web-user" : "assistant", project_id, audience, permissions: [...TODO_ACTION_PERMISSIONS] }));
  return { service, store, me: as(null), agent: as(null, "agent"), inA: as("project-a"), agentA: as("project-a", "agent"), inB: as("project-b"), prompts };
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

test("W2-18-TODO-DATE-01: new and existing todos use the same literal date and time despite contradictory model dates", async t => {
  for (const mode of ["new", "existing", "protected", "accepted"] as const) {
    let answer = "";
    const f = fixture(t, () => answer);
    const before = mode === "new" ? null : (await f.agent.invoke(todoActions.create, {
      title: "发送方案", due_date: "2026-10-05", due_time: "18:00",
    })).item;
    if (mode === "protected" || mode === "accepted") await f.me.invoke(todoActions.update, { id: before!.id, due_date: "2026-10-06", due_time: "19:00" });
    const material = { title: "工程约定", text: "请在10月2日上午10点发送方案。", received_at: "2026-09-28T09:00:00+08:00" };
    answer = JSON.stringify({ candidates: [{ ref: "literal", kind: "request", title: "发送方案", owner: { who: "你", stated: true },
      due: { date: "2030-01-01", time: "22:00", phrase: "10月2日上午10点" }, evidence: [{ material: 1, excerpt: material.text }],
      existing: before ? { id: before.id, relation: "update", changes: { due_date: "2031-01-01", due_time: "23:00" } } : null }] });
    const { batch } = await f.me.invoke(organize.extract, { materials: [material] });
    const candidate = batch.candidates[0]!;
    assert.deepEqual([candidate.due_date, candidate.due_time], ["2026-10-02", "10:00"], mode);
    if (mode === "existing") assert.deepEqual(candidate.existing?.changes, { due_date: "2026-10-02", due_time: "10:00" });
    if (mode === "protected" || mode === "accepted") {
      assert.deepEqual(candidate.existing?.changes, {});
      assert.deepEqual(candidate.existing?.protected, [{ field: "due_date", value: "2026-10-02" }, { field: "due_time", value: "10:00" }]);
    }
    const applied = await f.me.invoke(organize.apply, { id: batch.batch_id, expected_revision: batch.revision, decisions: [{ candidate_id: candidate.candidate_id,
      action: before ? "update" : "add", ...(mode === "accepted" ? { accept_protected: ["due_date", "due_time"] } : {}) }] });
    const id = before?.id ?? applied.results[0]!.item_id!;
    const readback = await f.me.invoke(todoActions.get, { id }), stored = readback.item;
    if (before) assert.deepEqual(["due_date", "due_time"].map(field => readback.history.find(change => Object.hasOwn(change.after, field))?.after[field]), [stored.due_date, stored.due_time], mode);
    else assert.deepEqual(readback.history.find(change => change.kind === "create")?.after, { title: "发送方案" });
    assert.deepEqual([stored.due_date, stored.due_time], mode === "protected" ? ["2026-10-06", "19:00"] : ["2026-10-02", "10:00"], mode);
    const reviewed = (await f.me.invoke(organize.get, { id: batch.batch_id })).batch.candidates[0]!;
    assert.equal(reviewed.decision?.item_id, id);
    assert.equal(JSON.stringify(reviewed).includes("2031-01-01"), false);
  }
});

test("W2-18-TODO-DATE-01: a date-only phrase adds no invented clock time; unprotected time is cleared and protected time needs acceptance", async t => {
  for (const protect of [false, true]) {
    let answer = "";
    const f = fixture(t, () => answer);
    const existing = (await f.agent.invoke(todoActions.create, { title: "发送方案", due_date: "2026-10-05", due_time: "18:00" })).item;
    if (protect) await f.me.invoke(todoActions.update, { id: existing.id, due_time: "19:00" });
    answer = JSON.stringify({ candidates: [{ ref: "date-only", kind: "request", title: "发送方案", owner: { who: "你", stated: true },
      due: { date: "2030-01-01", time: "22:00", phrase: "10月2日" }, evidence: [{ material: 1, excerpt: "请10月2日发方案" }],
      existing: { id: existing.id, relation: "update", changes: { due_date: "2031-01-01", due_time: "23:00" } } }] });
    const { batch } = await f.me.invoke(organize.extract, { materials: [{ title: "日期约定", text: "请10月2日发方案", received_at: "2026-09-28T09:00:00+08:00" }] });
    const candidate = batch.candidates[0]!;
    assert.deepEqual([candidate.due_date, candidate.due_time], ["2026-10-02", null]);
    assert.deepEqual(candidate.existing?.changes, protect ? { due_date: "2026-10-02" } : { due_date: "2026-10-02", due_time: null });
    assert.deepEqual(candidate.existing?.protected, protect ? [{ field: "due_time", value: null }] : []);
    await f.me.invoke(organize.apply, { id: batch.batch_id, decisions: [{ candidate_id: candidate.candidate_id, action: "update" }] });
    const stored = (await f.me.invoke(todoActions.get, { id: existing.id })).item;
    assert.deepEqual([stored.due_date, stored.due_time], ["2026-10-02", protect ? "19:00" : null]);
  }
});

test("W2-18-TODO-DATE-01: missing or ambiguous date evidence cannot overwrite an existing deadline", async t => {
  for (const phrase of ["周五前", "下次会前", "模型编造的日期"]) {
    let answer = "";
    const f = fixture(t, () => answer);
    const existing = (await f.agent.invoke(todoActions.create, { title: "发送方案", due_date: "2026-10-05", due_time: "18:00" })).item;
    const text = phrase === "模型编造的日期" ? "请发送方案" : `请${phrase}发送方案`;
    answer = JSON.stringify({ candidates: [{ ref: "uncertain", kind: "request", title: "发送方案", owner: { who: "你", stated: true },
      due: { date: "2030-01-01", time: "22:00", phrase }, evidence: [{ material: 1, excerpt: text }],
      existing: { id: existing.id, relation: "same", changes: { due_date: "2031-01-01", due_time: "23:00" } } }] });
    const { batch } = await f.me.invoke(organize.extract, { materials: [{ title: "待核对日期", text, received_at: null }] });
    const candidate = batch.candidates[0]!;
    assert.deepEqual([candidate.due_date, candidate.due_time, candidate.existing?.changes, candidate.existing?.protected], [null, null, {}, []]);
    await f.me.invoke(organize.apply, { id: batch.batch_id, decisions: [{ candidate_id: candidate.candidate_id, action: "merge" }] });
    const stored = (await f.me.invoke(todoActions.get, { id: existing.id })).item;
    assert.deepEqual([stored.due_date, stored.due_time], ["2026-10-05", "18:00"]);
  }
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

test("a field the person edits after the review was made stays theirs: the review shows it held back, applying takes the material's value only when they choose, and the decided candidate records what was done", async t => {
  const modes = ["untouched", "edited", "edited and taken", "set to the material's value", "merged only"] as const;
  /** What each choice leaves in the decided candidate's record: its relation, the changes written, the fields kept as the person's, and the todo's due date. */
  const recorded = {
    "untouched": ["update", { due_date: "2026-10-02" }, [], "2026-10-02"],
    "edited": ["conflict", {}, [{ field: "due_date", value: "2026-10-02" }], "2026-10-20"],
    "edited and taken": ["update", { due_date: "2026-10-02" }, [], "2026-10-02"],
    "set to the material's value": ["same", {}, [], "2026-10-02"],
    "merged only": ["same", {}, [], "2026-10-05"],
  } as const;
  for (const mode of modes) {
    let answer = "";
    const f = fixture(t, () => answer);
    const existing = (await f.me.invoke(todoActions.create, { title: "发送新版方案", due_date: "2026-10-05" })).item;
    answer = exampleAnswer({ id: existing.id, relation: "update", changes: { due_date: "2026-10-02" } });
    const { batch } = await f.me.invoke(organize.extract, { materials: [MAIL] });
    const send = batch.candidates.find(candidate => candidate.title === "发送新版方案")!;
    assert.deepEqual([send.existing?.relation, send.existing?.changes, send.existing?.protected, send.selected], ["update", { due_date: "2026-10-02" }, [], true], mode);
    if (mode === "edited" || mode === "edited and taken" || mode === "set to the material's value") {
      await f.me.invoke(todoActions.update, { id: existing.id, due_date: mode === "set to the material's value" ? "2026-10-02" : "2026-10-20" });
    }
    const reread = (await f.me.invoke(organize.get, { id: batch.batch_id })).batch.candidates.find(candidate => candidate.candidate_id === send.candidate_id)!;
    if (mode === "edited" || mode === "edited and taken") {
      assert.deepEqual([reread.existing?.relation, reread.existing?.changes, reread.existing?.protected, reread.selected],
        ["conflict", {}, [{ field: "due_date", value: "2026-10-02" }], false], `${mode}: the person's later edit is shown as theirs`);
    } else if (mode === "set to the material's value") {
      assert.deepEqual([reread.existing?.relation, reread.existing?.changes, reread.existing?.protected], ["same", {}, []], "nothing left to ask for");
    }
    // The client that still holds the review as first read sends the same choice either way.
    const applied = await f.me.invoke(organize.apply, { id: batch.batch_id, decisions: [{ candidate_id: send.candidate_id,
      action: mode === "merged only" ? "merge" : "update", ...(mode === "edited and taken" ? { accept_protected: ["due_date"] } : {}) }] });
    const item = (await f.me.invoke(todoActions.get, { id: existing.id })).item;
    const [relation, changes, kept, due] = recorded[mode];
    assert.equal(item.due_date, due, mode);
    // The review of a decided candidate is the record of what was done, not of what the batch once asked for.
    for (const decided of [applied.batch, (await f.me.invoke(organize.get, { id: batch.batch_id })).batch]) {
      const done = decided.candidates.find(candidate => candidate.candidate_id === send.candidate_id)!;
      assert.deepEqual([done.existing?.relation, done.existing?.changes, done.existing?.protected], [relation, changes, kept], `${mode}: the decided candidate records what was applied`);
      assert.equal(done.decision?.item_id, existing.id, mode);
    }
  }
});

test("an extract request id belongs to the caller and project that chose it: another caller reusing it organizes afresh", async t => {
  const f = fixture(t, () => exampleAnswer());
  const mine = await f.inA.invoke(organize.extract, { materials: [MAIL], request_id: "r-shared" });
  const other = await f.inB.invoke(organize.extract, { materials: [MAIL], request_id: "r-shared" });
  assert.equal(other.replayed, false);
  assert.notEqual(other.batch.batch_id, mine.batch.batch_id);
  assert.equal(other.batch.project_id, "project-b");
  const assistant = await f.agentA.invoke(organize.extract, { materials: [MAIL], request_id: "r-shared" });
  assert.deepEqual([assistant.replayed, assistant.batch.origin], [false, "assistant"]);
  assert.notEqual(assistant.batch.batch_id, mine.batch.batch_id);
  const retry = await f.inA.invoke(organize.extract, { materials: [MAIL], request_id: "r-shared" });
  assert.deepEqual([retry.replayed, retry.batch.batch_id], [true, mine.batch.batch_id], "the caller's own retry still replays");
});

test("a batch saved before request ids were kept per caller holds the raw id: it no longer matches (a retry organizes afresh) and the batch itself still lists, opens and applies", async t => {
  const f = fixture(t, () => exampleAnswer());
  const old = await f.me.invoke(organize.extract, { materials: [MAIL], request_id: "r-before" });
  // How such a row looks in a Home that kept the caller's id as it came.
  f.store.database().run("UPDATE todo_batches SET request_id = ? WHERE batch_id = ?", ["r-before", old.batch.batch_id]);
  assert.deepEqual((await f.me.invoke(organize.list, { status: "all" })).batches.map(batch => batch.batch_id), [old.batch.batch_id]);
  assert.equal((await f.me.invoke(organize.get, { id: old.batch.batch_id })).batch.batch_id, old.batch.batch_id);
  const again = await f.me.invoke(organize.extract, { materials: [MAIL], request_id: "r-before" });
  assert.deepEqual([again.replayed, again.batch.batch_id === old.batch.batch_id], [false, false], "an old retry is a new request: it does not dedupe");
  const retry = await f.me.invoke(organize.extract, { materials: [MAIL], request_id: "r-before" });
  assert.deepEqual([retry.replayed, retry.batch.batch_id], [true, again.batch.batch_id], "and from then on it is kept under the caller's key");
  const [send] = old.batch.candidates;
  const applied = await f.me.invoke(organize.apply, { id: old.batch.batch_id, decisions: [{ candidate_id: send!.candidate_id, action: "add" }] });
  assert.equal(applied.results[0]!.action, "added");
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

test("two candidates about the same existing todo become one: the one that says what changes, with both passages", async t => {
  let answer = "";
  const f = fixture(t, () => answer);
  const mine = (await f.me.invoke(todoActions.create, { title: "发送新版方案", due_date: "2026-10-05" })).item;
  answer = JSON.stringify({ candidates: [
    { ref: "c1", kind: "suggestion", title: "把发送新版方案的截止日期改到周五", owner: { who: "你", stated: false }, due: { date: null, phrase: null }, evidence: [{ material: 1, excerpt: "请周五前发新版方案" }], existing: { id: mine.id, relation: "same" } },
    { ref: "c2", kind: "request", title: "发送新版方案", owner: { who: "你", stated: true }, due: { date: "2026-10-02", phrase: "周五前" }, evidence: [{ material: 1, excerpt: "预算等小李确认" }], existing: { id: mine.id, relation: "update", changes: { due_date: "2026-10-02" } } },
    { ref: "c3", kind: "waiting", title: "等待小李确认预算", owner: { who: "小李", stated: true }, due: { date: null, phrase: null }, evidence: [{ material: 1, excerpt: "预算等小李确认" }], depends_on: ["c1"] },
  ] });
  const { batch } = await f.me.invoke(organize.extract, { materials: [MAIL] });
  const about = batch.candidates.filter(candidate => candidate.existing?.item_id === mine.id);
  assert.equal(about.length, 1, "同一件已有待办只留一项");
  assert.deepEqual([about[0]!.title, about[0]!.existing!.relation, about[0]!.existing!.changes], ["发送新版方案", "update", { due_date: "2026-10-02" }]);
  assert.deepEqual(about[0]!.evidence.map(entry => entry.excerpt).sort(), ["请周五前发新版方案", "预算等小李确认"]);
  assert.equal(batch.candidates.length, 2);
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

test("RAC-1677: organizing keeps the batch's name, a material's name and a candidate's title in whole characters, and tells titles apart by their first 120 whole characters", async t => {
  // extract's schema counts characters: a 120-character batch name and 200-character material names; a candidate's title is cut to the
  // 200 characters todo.items.create counts (RAC-1655). One 🟢 is one character but two UTF-16 units; U+20000 and U+20001 are letters,
  // so matching keeps them, and they differ only in their second unit.
  const wide = (count: number) => "🟢".repeat(count);
  const name = "a" + wide(119), source = "a" + wide(199), twin = "b".repeat(119);
  const passage = [{ material: 1, excerpt: "请周五前发新版方案" }];
  const f = fixture(t, () => JSON.stringify({ candidates: [
    { ref: "long", kind: "request", title: "a" + wide(250), evidence: passage },
    { ref: "one", kind: "request", title: twin + "\u{20000}", evidence: passage },
    { ref: "two", kind: "request", title: twin + "\u{20001}", evidence: passage },
  ] }));
  const { batch } = await f.me.invoke(organize.extract, { title: name, materials: [{ title: source, text: MAIL.text }] });
  assert.equal(batch.title, name, "the batch keeps its 120-character name whole");
  assert.equal(batch.materials[0]!.title, source, "a material keeps its 200-character name whole");
  assert.equal(batch.candidates[0]!.title, "a" + wide(199), "a candidate's title past 200 characters is cut to 200 whole characters");
  assert.deepEqual(batch.candidates.slice(1).map(candidate => candidate.title), [twin + "\u{20000}", twin + "\u{20001}"],
    "two titles that differ in their 120th character stay two candidates");
});

test("RAC-1678: adopting a candidate keeps its whole why as the source's reason, and ignoring one keeps the person's whole reason", async t => {
  // A candidate's why is cut to the 500 characters a todo source's reason counts (RAC-1656); apply's schema allows a 100-character
  // ignore reason. One 🟢 is one character but two UTF-16 units.
  const wide = (count: number) => "🟢".repeat(count);
  const why = "a" + wide(499), reason = "a" + wide(99);
  const passage = [{ material: 1, excerpt: "请周五前发新版方案" }];
  const f = fixture(t, () => JSON.stringify({ candidates: [
    { ref: "add", kind: "request", title: "发送新版方案", why, evidence: passage },
    { ref: "skip", kind: "request", title: "准备季度汇报", why: "顺带一提", evidence: passage },
  ] }));
  const { batch } = await f.me.invoke(organize.extract, { materials: [MAIL] });
  const [added, skipped] = batch.candidates;
  const applied = await f.me.invoke(organize.apply, { id: batch.batch_id, expected_revision: batch.revision, decisions: [
    { candidate_id: added!.candidate_id, action: "add" }, { candidate_id: skipped!.candidate_id, action: "ignore", ignore_reason: reason }] });
  const { item } = await f.me.invoke(todoActions.get, { id: applied.results[0]!.item_id! });
  assert.deepEqual(item.sources.map(source => source.reason), [why], "the added todo's source keeps the 500-character why as its reason");
  const reviewed = (await f.me.invoke(organize.get, { id: batch.batch_id })).batch.candidates[1]!;
  assert.equal(reviewed.decision?.reason, reason, "the ignored candidate keeps its 100-character reason whole");
});
