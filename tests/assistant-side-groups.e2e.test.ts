import assert from "node:assert/strict";
import test from "node:test";
import type { AssistantBackgroundJob, AssistantUndoable, AssistantUnsettledChange } from "@molis-ai/molis-work-contracts/services/assistant";
import { openWork, putInput, seedWork, sendBrowser } from "./fixtures/assistant-send-journey.js";

// specs/visual-ui-experience VUX-08, VUX-22: the Assistant's side groups what a work made, changed and still runs elsewhere
// into one disclosure each. A real work on a real Host; its change and job rows, which only an owner's undoable action or
// background job writes, are added to the view the page reads, in the contract's shape.
const at = "2026-10-19T08:00:00.000Z";
const undoable: AssistantUndoable[] = [
  { undo_id: "u1", title: "Todo · 新建「周报」", state: "available", created_at: at, capability_id: "todo.items.create" },
  { undo_id: "u2", title: "Pages · 改写「发布计划」", state: "failed", created_at: at, detail: "文档已被别人改过" },
];
const unsettled: AssistantUnsettledChange[] = [];
const job = (state: AssistantBackgroundJob["state"]): AssistantBackgroundJob[] => [{ job_id: "j1", work_id: "", title: "Feed · 抓取订阅", state, started_at: at }];

test("VUX-08 VUX-22: 产出, 变更 and 后台任务 are one disclosure each; folded they keep the summary that matters, open and fold to natural height, and an update never unfolds them", { timeout: 120_000 }, async t => {
  const browser = await sendBrowser(t); if (!browser) return;
  const { evaluate, waitFor, click, command, sessionId } = browser;
  const id = await seedWork(browser, "整理本周的变更");
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] }, sessionId);
  await evaluate(`(() => { window.__jobState = "running"; const fetch0 = window.fetch; window.fetch = async (input, init) => {
    const response = await fetch0(input, init), path = new URL(typeof input === "string" ? input : input.url, location.href).pathname;
    if (!/\\/api\\/assistant\\/works\\/${id}$/.test(path) || (init && init.method && init.method !== "GET")) return response;
    const view = await response.json();
    Object.assign(view, { undoable: ${JSON.stringify(undoable)}, unsettled: ${JSON.stringify(unsettled)}, jobs: ${JSON.stringify(job("running"))}.map((one) => ({ ...one, state: window.__jobState })) });
    return new Response(JSON.stringify(view), { status: response.status, headers: response.headers });
  }; })()`);
  await openWork(browser, id);
  const block = (key: string) => `document.querySelector('[data-assistant-block="${key}"]')`;
  await waitFor(`${block("changes")}?.checkVisibility() && ${block("background")}?.checkVisibility()`, 15_000);

  assert.equal(await evaluate<boolean>(`${block("results")}.hidden`), true, "nothing made: no 产出 card is drawn for it");
  const head = (key: string) => `${block(key)}.querySelector('.assistant-block-head')`;
  const badge = (key: string) => evaluate<[string, boolean]>(`(() => { const b = ${block(key)}.querySelector('.assistant-block-badge'); return [b.textContent, b.classList.contains('is-attention')]; })()`);
  assert.deepEqual(await badge("changes"), ["1 项失败", true], "a failed change is the summary, and it stands out");
  assert.deepEqual(await badge("background"), ["1 项进行中", false]);
  assert.deepEqual(await evaluate(`[${head("changes")}.getAttribute('aria-expanded'), ${head("changes")}.getAttribute('aria-controls') === ${block("changes")}.querySelector('.assistant-block-body').id]`), ["true", true]);
  assert.equal(await evaluate<string>(`[...${block("changes")}.querySelectorAll('.assistant-item')].map((n) => n.textContent).join('|').includes('文档已被别人改过')`), true, "open, each change says how it stands");

  // Folding: the height runs from open to the heading alone, through the heights between, and the body leaves reach.
  // The page holds still under automation (craft-finish STILL_RESET); this check lifts that to see the motion itself.
  await evaluate(`document.documentElement.removeAttribute('data-craft-still')`);
  const open = await evaluate<number>(`${block("changes")}.getBoundingClientRect().height`);
  const headHeight = await evaluate<number>(`${head("changes")}.getBoundingClientRect().height`);
  await click(`[data-assistant-block="changes"] .assistant-block-head`);
  await new Promise(resolve => setTimeout(resolve, 70));
  const between = await evaluate<number>(`${block("changes")}.getBoundingClientRect().height`);
  assert.ok(between < open - 2 && between > headHeight + 2, `the fold passes through natural heights (${headHeight} < ${between} < ${open})`);
  await waitFor(`Math.abs(${block("changes")}.getBoundingClientRect().height - ${head("changes")}.getBoundingClientRect().height) < 1`);
  await new Promise(resolve => setTimeout(resolve, 300));
  assert.equal(await evaluate<string>(`${head("changes")}.getAttribute('aria-expanded')`), "false");
  assert.equal(await evaluate<boolean>(`[...${block("changes")}.querySelectorAll('button')].filter((b) => !b.closest('.assistant-block-head')).some((b) => b.checkVisibility({ visibilityProperty: true }))`), false, "folded, its buttons cannot be reached");
  assert.deepEqual(await badge("changes"), ["1 项失败", true], "folded, the failure still shows");

  // An update arrives: the job finished. The folded group stays folded; the other's summary follows.
  await evaluate(`window.__jobState = "completed"`);
  await openWork(browser, id);
  await waitFor(`${block("background")}.querySelector('.assistant-block-badge')?.textContent === '1'`);
  assert.equal(await evaluate<string>(`${head("changes")}.getAttribute('aria-expanded')`), "false", "an update never unfolds what the person folded");

  // Opening runs the other way and the rows come back into reach.
  await click(`[data-assistant-block="changes"] .assistant-block-head`);
  await waitFor(`Math.abs(${block("changes")}.getBoundingClientRect().height - ${open}) < 2`);
  assert.equal(await evaluate<boolean>(`[...${block("changes")}.querySelectorAll('.assistant-item button')].some((b) => b.checkVisibility({ visibilityProperty: true }))`), true);
});

// VUX-08 「长列表可显示更多」: a long group keeps its first five in sight and the rest behind one button that says how many;
// a failure is never tucked away; revealing moves focus to the first revealed row and lasts when the view is drawn again.
test("VUX-08: a long side group shows five, says how many more, never tucks a failure away, and stays revealed on update", { timeout: 120_000 }, async t => {
  const browser = await sendBrowser(t); if (!browser) return;
  const { evaluate, waitFor, click } = browser;
  const id = await seedWork(browser, "整理一长串改动");
  const many: AssistantUndoable[] = Array.from({ length: 9 }, (_, index) => ({ undo_id: "u" + index, title: "Todo · 第 " + (index + 1) + " 项", state: index === 0 ? "failed" : "available", created_at: at, detail: index === 0 ? "被别人改过" : undefined }));
  await evaluate(`(() => { const fetch0 = window.fetch; window.fetch = async (input, init) => {
    const response = await fetch0(input, init), path = new URL(typeof input === "string" ? input : input.url, location.href).pathname;
    if (!/\\/api\\/assistant\\/works\\/${id}$/.test(path) || (init && init.method && init.method !== "GET")) return response;
    const view = await response.json();
    Object.assign(view, { undoable: ${JSON.stringify(many)}.map((one) => window.__update && one.undo_id === "u8" ? { ...one, detail: "（更新）" } : one), unsettled: [], jobs: [] });
    return new Response(JSON.stringify(view), { status: response.status, headers: response.headers });
  }; })()`);
  await openWork(browser, id);
  const block = `document.querySelector('[data-assistant-block="changes"]')`;
  await waitFor(`${block}?.checkVisibility() && ${block}.querySelector('.mw-show-more')`, 15_000);
  // Newest first: 第 9 … 第 5 in sight, 第 4 … 第 2 tucked, and 第 1 项 (the failure, last) still in sight.
  const seen = () => evaluate<string[]>(`[...${block}.querySelectorAll('.assistant-item')].filter((n) => n.checkVisibility()).map((n) => n.querySelector('.assistant-item-title').textContent)`);
  assert.deepEqual(await seen(), ["Todo · 第 9 项", "Todo · 第 8 项", "Todo · 第 7 项", "Todo · 第 6 项", "Todo · 第 5 项", "Todo · 第 1 项"], "five in sight, and the failure is never tucked away");
  assert.equal(await evaluate<string>(`${block}.querySelector('.mw-show-more').textContent`), "再显示 3 项");
  assert.equal(await evaluate<string>(`${block}.querySelector('.mw-show-more').nextElementSibling?.querySelector('.assistant-item-title')?.textContent`), "Todo · 第 1 项", "the button stands where the tucked rows are, before the failure kept after them");
  await click(`[data-assistant-block="changes"] .mw-show-more`);
  assert.equal((await seen()).length, 9, "all of them once asked");
  assert.equal(await evaluate<string>(`document.activeElement.closest('.assistant-item')?.querySelector('.assistant-item-title').textContent`), "Todo · 第 4 项", "focus goes to the first row it revealed");
  assert.equal(await evaluate<boolean>(`!${block}.querySelector('.mw-show-more')`), true);
  // The view is drawn again (a row changed): what the person revealed stays revealed.
  await evaluate("window.__update = true");
  await openWork(browser, id);
  await waitFor(`${block}.textContent.includes('（更新）')`);
  assert.equal((await seen()).length, 9);
});

// VUX-08 「固定成果、工作文件和过程项分别保留其身份」: what a work made is grouped by what it is. A fixed version kept in the
// 成果库 (its subject kind is the 成果库's) is a 固定成果; any other object its owner keeps changing is a 工作文件. The two
// results are added to the view the page reads, in the contract's shape, as a reader would give them.
test("VUX-08: 产出 keeps a fixed 成果库 version apart from the working objects its owners keep changing", { timeout: 120_000 }, async t => {
  const browser = await sendBrowser(t); if (!browser) return;
  const { evaluate, waitFor } = browser;
  const id = await seedWork(browser, "把周报定稿");
  const made = [
    { relation: "result", subject: { kind: "pages_document", id: "doc-1" }, title: "周报草稿", recorded_revision: "3", current_revision: "3", state: "current", recorded_at: at },
    { relation: "result", subject: { kind: "artifact", id: "art-1" }, title: "周报 第 2 版", recorded_revision: "2", current_revision: "2", state: "current", recorded_at: at },
  ];
  await evaluate(`(() => { const fetch0 = window.fetch; window.fetch = async (input, init) => {
    const response = await fetch0(input, init), path = new URL(typeof input === "string" ? input : input.url, location.href).pathname;
    if (!/\\/api\\/assistant\\/works\\/${id}$/.test(path) || (init && init.method && init.method !== "GET")) return response;
    const view = await response.json();
    Object.assign(view, { objects: [...(view.objects || []), ...${JSON.stringify(made)}] });
    return new Response(JSON.stringify(view), { status: response.status, headers: response.headers });
  }; })()`);
  await openWork(browser, id);
  const results = `document.querySelector('[data-assistant-block="results"]')`;
  await waitFor(`${results}?.checkVisibility() && ${results}.querySelectorAll('.assistant-group').length === 2`, 15_000);
  const groups = await evaluate<Array<[string, string]>>(`[...${results}.querySelectorAll('.assistant-group')].map((g) => [g.querySelector('.assistant-block-sub')?.textContent || '', g.querySelector('.assistant-stack').textContent])`);
  assert.deepEqual(groups.map(([label]) => label), ["固定成果", "工作文件"], "the fixed version first, each under what it is");
  assert.match(groups[0]![1], /周报 第 2 版/);
  assert.doesNotMatch(groups[0]![1], /周报草稿/);
  assert.match(groups[1]![1], /周报草稿/);
  assert.equal(await evaluate<string>(`${results}.querySelector('.assistant-block-badge').textContent`), "2", "the summary still counts everything made");
});

// VUX-08/09 「上下文显示待发送/本次实际使用/历史引用」: what the next Send carries, what the latest round used and what earlier
// rounds used are three places, never one list. The two rounds' materials and the work's material objects are added to the
// view the page reads, in the contract's shape; the pending one is put in as a page hands one over. The Host records an
// object's relation before the round starts (the Send links it, then dispatches), and a second use keeps the first record,
// so an object is placed by the rounds whose materials name it, not by its time.
test("VUX-08 VUX-09: 上下文 keeps what waits to be sent, what this round used and what earlier rounds used apart", { timeout: 120_000 }, async t => {
  const browser = await sendBrowser(t); if (!browser) return;
  const { evaluate, waitFor } = browser;
  const id = await seedWork(browser, "整理本周数据");
  const early = "2026-10-19T08:00:00.000Z", late = "2026-10-19T09:00:00.000Z";
  await evaluate(`(() => { const fetch0 = window.fetch; window.fetch = async (input, init) => {
    const response = await fetch0(input, init), path = new URL(typeof input === "string" ? input : input.url, location.href).pathname;
    if (!/\\/api\\/assistant\\/works\\/${id}$/.test(path) || (init && init.method && init.method !== "GET")) return response;
    const view = await response.json(), round = view.rounds[0];
    const page = (id, title) => ({ material_id: "m-" + id, kind: "object", title, explicit: true, object: { kind: "pages_document", id } });
    view.rounds = [{ ...round, run_id: "r-early", started_at: ${JSON.stringify(early)}, materials: [{ material_id: "m-old", kind: "text", title: "旧会议纪要", explicit: true }, page("p-old", "上周周报"), page("p-both", "项目说明")] },
      { ...round, run_id: "r-late", started_at: ${JSON.stringify(late)}, materials: [{ material_id: "m-new", kind: "file", title: "本周数据.csv", explicit: true }, page("p-new", "本周计划"), page("p-both", "项目说明")],
        context: { ...(round.context || {}), source: { surface: "pages" }, captured_at: ${JSON.stringify(late)}, selection: { text: "第三季度  收入", truncated: false } } }];
    view.objects = [...(view.objects || []).filter((o) => o.relation !== "material"),
      { relation: "material", subject: { kind: "pages_document", id: "p-old" }, title: "上周周报", recorded_revision: "1", current_revision: "1", state: "current", recorded_at: "2026-10-19T07:59:59.000Z" },
      { relation: "material", subject: { kind: "pages_document", id: "p-both" }, title: "项目说明", recorded_revision: "2", current_revision: "2", state: "current", recorded_at: "2026-10-19T07:59:59.000Z" },
      { relation: "material", subject: { kind: "pages_document", id: "p-new" }, title: "本周计划", recorded_revision: "4", current_revision: "4", state: "current", recorded_at: "2026-10-19T08:59:59.000Z" }];
    return new Response(JSON.stringify(view), { status: response.status, headers: response.headers });
  }; })()`);
  await openWork(browser, id);
  const box = `document.querySelector('[data-assistant-block="materials"]')`;
  await waitFor(`${box}?.hidden === false && ${box}.textContent.includes('本周计划')`, 15_000);
  await putInput(browser, "接着整理", "补充说明");
  await waitFor(`${box}.querySelector('.assistant-drop').textContent.includes('补充说明')`);
  const read = await evaluate<{ title: string; pending: string; groups: Array<[string, string]>; badge: string }>(`(() => ({
    title: ${box}.querySelector('.assistant-block-title').textContent,
    pending: ${box}.querySelector('.assistant-drop').textContent,
    groups: [...${box}.querySelectorAll('.assistant-group')].map((g) => [g.querySelector('.assistant-block-sub').textContent, g.querySelector('.assistant-tiles').textContent]),
    badge: ${box}.querySelector('.assistant-block-badge').textContent }))()`);
  assert.equal(read.title, "上下文");
  assert.match(read.pending, /待发送/);
  assert.doesNotMatch(read.pending, /本周数据|本周计划|旧会议纪要|上周周报/, "nothing already used is shown as waiting");
  assert.deepEqual(read.groups.map(([label]) => label), ["本次使用", "历史引用"]);
  assert.match(read.groups[0]![1], /本周计划/); assert.match(read.groups[0]![1], /本周数据\.csv/); assert.match(read.groups[0]![1], /选中的内容：第三季度 收入/, "what the round saw of the page is part of what it used");
  assert.match(read.groups[0]![1], /项目说明/, "used in both rounds, it is under the latest");
  assert.doesNotMatch(read.groups[0]![1], /上周周报|旧会议纪要/);
  assert.doesNotMatch(read.groups[1]![1], /项目说明/, "each object once");
  assert.match(read.groups[1]![1], /上周周报.*第 1 轮/, "an object an earlier round used says which round"); assert.match(read.groups[1]![1], /旧会议纪要.*第 1 轮|第 1 轮.*旧会议纪要/);
  assert.equal(read.badge, "1 项待发送", "what waits is the summary while nothing changed");
});
